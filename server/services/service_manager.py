"""Headless service launcher — starts/stops qB services from launch.json.

Reads the launcher configuration, starts services sequentially using
subprocess, tracks PIDs for graceful shutdown, and captures stdout
into per-service ring buffers for the live log viewer.
"""

import collections
import json
import logging
import os
import shlex
import signal
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("qBc_ConfigMgr.svc_mgr")

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
LAUNCH_FILE = PROJECT_ROOT / "qBc_Launcher" / "launchfiles" / "launch.json"
LOG_DIR = PROJECT_ROOT / "qBc_Launcher" / "logs"
STARTUP_GRACE = 2.0  # seconds between services when wait_prev is set
LOG_BUFFER_SIZE = 500  # lines per service


TOPIC_LOADING_PROGRESS = "robot/system/loading_progress"


class ServiceManager:
    """Manages qB Companion service processes with log capture."""

    def __init__(self, mqtt_bridge=None):
        self._procs: dict[str, subprocess.Popen] = {}  # name -> Popen
        self._logs: dict[str, collections.deque] = {}   # name -> deque of (ts, line)
        self._log_files: dict[str, object] = {}         # name -> open file handle
        self._session_dir: Path | None = None
        self._lock = threading.Lock()
        self._starting = False
        self._thread: threading.Thread | None = None
        self._readers: list[threading.Thread] = []
        self._mqtt_bridge = mqtt_bridge

    @property
    def running(self) -> bool:
        with self._lock:
            return any(p.poll() is None for p in self._procs.values())

    @property
    def starting(self) -> bool:
        return self._starting

    def get_status(self) -> dict:
        with self._lock:
            services = {}
            for name, proc in self._procs.items():
                rc = proc.poll()
                services[name] = {
                    "pid": proc.pid,
                    "running": rc is None,
                    "returncode": rc,
                }
            return {
                "launching": self._starting,
                "services": services,
            }

    def get_logs(self, since: float = 0.0) -> dict:
        """Return buffered log lines per service, optionally filtered by timestamp."""
        with self._lock:
            result = {}
            for name, buf in self._logs.items():
                lines = [
                    {"ts": ts, "text": text}
                    for ts, text in buf
                    if ts > since
                ]
                if lines:
                    result[name] = lines
            return result

    def get_service_names(self) -> list[str]:
        """Return ordered list of managed service names."""
        with self._lock:
            return list(self._logs.keys())

    def start_all(self) -> dict:
        """Start all services from launch.json in background."""
        if self._starting:
            return {"status": "error", "message": "Already starting"}
        if self.running:
            return {"status": "error", "message": "Services already running"}

        entries = self._load_config()
        if not entries:
            return {"status": "error", "message": "No services in launch config"}

        # Create session log directory
        timestamp = datetime.now().strftime("%d-%m-%y_%H-%M-%S")
        self._session_dir = LOG_DIR / timestamp
        self._session_dir.mkdir(parents=True, exist_ok=True)

        # Pre-create log buffers and log files in launch order
        with self._lock:
            # Close any leftover log files from a previous session
            for lf in self._log_files.values():
                if lf and not lf.closed:
                    lf.close()
            self._logs.clear()
            self._log_files.clear()
            for entry in entries:
                name = entry.get("name", "unknown")
                self._logs[name] = collections.deque(maxlen=LOG_BUFFER_SIZE)
                safe_name = name.replace(" ", "-")
                log_path = self._session_dir / f"{safe_name}.log"
                self._log_files[name] = open(log_path, "w")

        self._starting = True
        self._thread = threading.Thread(
            target=self._launch_sequence, args=(entries,), daemon=True,
        )
        self._thread.start()
        return {"status": "ok", "message": f"Starting {len(entries)} services"}

    def _find_service(self, name: str):
        """Find a managed service by exact or fuzzy name match.

        Accepts launch.json names (e.g. "Audio Service") or MQTT-style
        names (e.g. "audio") and returns (canonical_name, proc) or (None, None).
        """
        with self._lock:
            # Exact match first
            if name in self._procs:
                return name, self._procs[name]
            # Normalize: lowercase, strip common suffixes, remove separators
            def _norm(s):
                return s.lower().replace("_", "").replace(" ", "").replace("-", "")
            needle = _norm(name)
            for svc_name, proc in self._procs.items():
                # Match "audio" → "Audio Service", "llm" → "LLM Server", etc.
                candidate = _norm(svc_name)
                if needle == candidate or candidate.startswith(needle):
                    return svc_name, proc
            return None, None

    def restart_service(self, name: str) -> dict:
        """Restart a single managed service by name."""
        svc_name, proc = self._find_service(name)
        if svc_name is None:
            return {"status": "error", "message": f"Unknown service: {name}"}

        # Find the matching launch config entry
        entries = self._load_config()
        entry = None
        for e in entries:
            if e.get("name") == svc_name:
                entry = e
                break
        if entry is None:
            return {"status": "error", "message": f"No config for service: {svc_name}"}

        # Stop the running process
        if proc.poll() is None:
            logger.info("Stopping %s (PID %d) for restart...", svc_name, proc.pid)
            self._append_log(svc_name, f"[Restarting {svc_name}...]")
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning("Force-killing %s (PID %d)", svc_name, proc.pid)
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass
                proc.wait(timeout=2)

        self._append_log(svc_name, f"[{svc_name} stopped — restarting...]")

        # Start the process again
        try:
            new_proc = self._start_process(entry)
            with self._lock:
                self._procs[svc_name] = new_proc
            self._append_log(svc_name, f"[Restarted PID {new_proc.pid}]")
            logger.info("Restarted %s (PID %d)", svc_name, new_proc.pid)

            # Spawn reader thread for the new process
            reader = threading.Thread(
                target=self._read_output, args=(svc_name, new_proc), daemon=True,
            )
            reader.start()
            self._readers.append(reader)

            return {"status": "ok", "message": f"Restarted {svc_name} (PID {new_proc.pid})"}
        except Exception as e:
            logger.error("Failed to restart %s: %s", svc_name, e)
            self._append_log(svc_name, f"[Failed to restart: {e}]")
            return {"status": "error", "message": str(e)}

    def stop_all(self) -> dict:
        """Stop all managed services gracefully."""
        self._starting = False
        with self._lock:
            procs = dict(self._procs)

        if not procs:
            return {"status": "ok", "message": "No services running"}

        # SIGTERM all
        for name, proc in procs.items():
            if proc.poll() is None:
                logger.info("Stopping %s (PID %d)...", name, proc.pid)
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except (ProcessLookupError, PermissionError):
                    pass

        # Wait then SIGKILL stragglers
        deadline = time.monotonic() + 5.0
        for name, proc in procs.items():
            remaining = max(0.1, deadline - time.monotonic())
            try:
                proc.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                logger.warning("Force-killing %s (PID %d)", name, proc.pid)
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass

        with self._lock:
            self._procs.clear()
            for lf in self._log_files.values():
                if lf and not lf.closed:
                    lf.close()

        logger.info("All services stopped")
        return {"status": "ok", "message": f"Stopped {len(procs)} services"}

    def _load_config(self) -> list[dict]:
        """Load launch.json and filter out Configuration Manager."""
        if not LAUNCH_FILE.exists():
            logger.error("Launch config not found: %s", LAUNCH_FILE)
            return []
        try:
            with open(LAUNCH_FILE) as f:
                data = json.load(f)
            entries = data.get("scripts", [])
            return [
                e for e in entries
                if "configuration" not in e.get("name", "").lower()
            ]
        except Exception as e:
            logger.error("Failed to load launch config: %s", e)
            return []

    def _publish_progress(self, service_name: str, percent: int, message: str = ""):
        """Publish loading progress for a service."""
        if self._mqtt_bridge and self._mqtt_bridge.connected:
            self._mqtt_bridge.mqtt_client.publish(
                TOPIC_LOADING_PROGRESS,
                json.dumps({
                    "service": service_name.lower().replace(" ", "_"),
                    "stage": "loading",
                    "percent": min(100, max(0, percent)),
                    "message": message or service_name,
                }),
                qos=0,
            )

    def _append_log(self, name: str, text: str):
        """Append a log line to the service's ring buffer and log file."""
        with self._lock:
            buf = self._logs.get(name)
            if buf is not None:
                buf.append((time.time(), text))
            lf = self._log_files.get(name)
            if lf is not None:
                try:
                    lf.write(text + "\n")
                    lf.flush()
                except (ValueError, OSError):
                    pass

    def _read_output(self, name: str, proc: subprocess.Popen):
        """Read process stdout line-by-line and store in ring buffer."""
        try:
            for line in proc.stdout:
                text = line.rstrip("\n")
                if text:
                    self._append_log(name, text)
        except (ValueError, OSError):
            pass
        rc = proc.wait()
        self._append_log(name, f"[Process exited with code {rc}]")

    def _launch_sequence(self, entries: list[dict]):
        """Start services sequentially (runs in background thread)."""
        try:
            for i, entry in enumerate(entries):
                if not self._starting:
                    break

                name = entry.get("name", f"service-{i}")

                # Wait for previous service if required
                if entry.get("wait_prev") and i > 0:
                    prev_name = entries[i - 1].get("name", "")
                    time.sleep(STARTUP_GRACE)
                    with self._lock:
                        prev = self._procs.get(prev_name)
                    if prev and prev.poll() is not None:
                        logger.error(
                            "%s crashed (code %d) — aborting launch",
                            prev_name, prev.returncode,
                        )
                        self._append_log(
                            name,
                            f"[Aborted — {prev_name} crashed]",
                        )
                        break

                # Optional delay
                delay = entry.get("delay_ms", 0) / 1000.0
                if delay > 0:
                    time.sleep(delay)

                try:
                    self._append_log(name, f"[Starting {name}...]")
                    # Publish staged progress: ramp from 0→100 per service
                    self._publish_progress(name, 0, f"Starting {name}...")
                    proc = self._start_process(entry)
                    with self._lock:
                        self._procs[name] = proc
                    self._append_log(name, f"[Started PID {proc.pid}]")
                    self._publish_progress(name, 100, f"{name} started")
                    logger.info("Started %s (PID %d)", name, proc.pid)

                    # Spawn reader thread
                    reader = threading.Thread(
                        target=self._read_output, args=(name, proc), daemon=True,
                    )
                    reader.start()
                    self._readers.append(reader)
                except Exception as e:
                    logger.error("Failed to start %s: %s", name, e)
                    self._append_log(name, f"[Failed to start: {e}]")
                    break
        finally:
            self._starting = False

    def _start_process(self, entry: dict) -> subprocess.Popen:
        """Start a single service subprocess with stdout capture.

        Supports three modes via the entry dict:
          - "command" (list[str]): Run a raw command directly (no Python/venv).
          - "script" + "venv": Activate venv, then run Python script.
          - "script" only: Run with current Python interpreter.
        """
        launcher_dir = LAUNCH_FILE.parent.parent
        args = entry.get("args", [])

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env.setdefault("DISPLAY", ":0")
        env.setdefault("WAYLAND_DISPLAY", "wayland-0")
        env.setdefault("XDG_RUNTIME_DIR", "/run/user/1000")

        # Raw command mode (for non-Python binaries like axllm, whisper_srv)
        if "command" in entry:
            cmd = list(entry["command"]) + args
            cwd = entry.get("cwd", str(PROJECT_ROOT))
            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
            return proc

        # Python script mode
        script_path = str((launcher_dir / entry["script"]).resolve())
        script_dir = str(Path(script_path).parent)
        venv = entry.get("venv", "")

        if venv:
            activate = str((launcher_dir / venv / "bin" / "activate").resolve())
            quoted_args = " ".join(shlex.quote(a) for a in args)
            shell_cmd = (
                f"source {shlex.quote(activate)} && "
                f"exec python {shlex.quote(script_path)} {quoted_args}"
            )
            proc = subprocess.Popen(
                ["bash", "-c", shell_cmd],
                cwd=script_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
        else:
            import sys
            proc = subprocess.Popen(
                [sys.executable, script_path] + args,
                cwd=script_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
        return proc
