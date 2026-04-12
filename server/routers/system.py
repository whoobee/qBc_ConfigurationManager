"""System status and control REST endpoints."""

import logging
import re
import subprocess
from pathlib import Path

from fastapi import APIRouter, Request

logger = logging.getLogger("qBc_ConfigMgr.system")

router = APIRouter()

THERMAL_PATH = Path("/sys/class/thermal/thermal_zone0/temp")
LOADAVG_PATH = Path("/proc/loadavg")
MEMINFO_PATH = Path("/proc/meminfo")
UPTIME_PATH = Path("/proc/uptime")
AXCL_SMI = "/usr/bin/axcl/axcl-smi"


@router.get("/status")
async def get_system_status(request: Request):
    """Get service heartbeat summary."""
    tracker = request.app.state.heartbeat_tracker
    bridge = request.app.state.mqtt_bridge
    return {
        "mqtt_connected": bridge.connected,
        "ws_clients": request.app.state.ws_manager.client_count,
        "services": tracker.get_snapshot(),
    }


@router.get("/topics")
async def get_topic_registry():
    """Get the full MQTT topic registry."""
    from server.services.tree_service import get_topic_registry
    return get_topic_registry()


@router.get("/metrics")
async def get_system_metrics():
    """Get Raspberry Pi hardware metrics and AXCL accelerator stats."""
    return {
        "rpi": _get_rpi_metrics(),
        "axcl": _get_axcl_metrics(),
    }


@router.get("/logs")
async def get_logs(request: Request, since: float = 0.0):
    """Get buffered log lines from all services, optionally since a timestamp."""
    svc_mgr = request.app.state.service_manager
    return {
        "services": svc_mgr.get_service_names(),
        "logs": svc_mgr.get_logs(since),
    }


@router.post("/services/start")
async def start_services(request: Request):
    """Start all qB services from launch.json."""
    svc_mgr = request.app.state.service_manager
    return svc_mgr.start_all()


@router.post("/services/stop")
async def stop_services(request: Request):
    """Stop all managed qB services."""
    svc_mgr = request.app.state.service_manager
    return svc_mgr.stop_all()


@router.get("/services/launcher")
async def get_launcher_status(request: Request):
    """Get status of managed service processes."""
    svc_mgr = request.app.state.service_manager
    return svc_mgr.get_status()


@router.post("/shutdown")
async def shutdown_system():
    """Shutdown the Raspberry Pi."""
    logger.warning("System shutdown requested via dashboard")
    subprocess.Popen(["sudo", "shutdown", "-h", "now"])
    return {"status": "ok", "message": "Shutting down..."}


@router.post("/reboot")
async def reboot_system():
    """Reboot the Raspberry Pi."""
    logger.warning("System reboot requested via dashboard")
    subprocess.Popen(["sudo", "reboot"])
    return {"status": "ok", "message": "Rebooting..."}


def _get_rpi_metrics():
    """Read Raspberry Pi CPU temp, load, RAM, disk."""
    result = {
        "cpu_temp_c": None,
        "load_1m": None,
        "load_5m": None,
        "load_15m": None,
        "ram_total_mb": None,
        "ram_used_mb": None,
        "ram_pct": None,
        "disk_total_gb": None,
        "disk_used_gb": None,
        "disk_pct": None,
        "uptime_sec": None,
    }

    # CPU temperature
    try:
        raw = THERMAL_PATH.read_text().strip()
        result["cpu_temp_c"] = round(int(raw) / 1000, 1)
    except Exception:
        pass

    # Load average
    try:
        parts = LOADAVG_PATH.read_text().strip().split()
        result["load_1m"] = float(parts[0])
        result["load_5m"] = float(parts[1])
        result["load_15m"] = float(parts[2])
    except Exception:
        pass

    # RAM from /proc/meminfo
    try:
        text = MEMINFO_PATH.read_text()
        total = int(re.search(r"MemTotal:\s+(\d+)", text).group(1))  # kB
        available = int(re.search(r"MemAvailable:\s+(\d+)", text).group(1))  # kB
        used = total - available
        result["ram_total_mb"] = round(total / 1024)
        result["ram_used_mb"] = round(used / 1024)
        result["ram_pct"] = round(used / total * 100, 1) if total > 0 else 0
    except Exception:
        pass

    # Disk usage
    try:
        out = subprocess.run(
            ["df", "--output=size,used,pcent", "-BG", "/"],
            capture_output=True, text=True, timeout=2,
        )
        line = out.stdout.strip().splitlines()[-1].split()
        result["disk_total_gb"] = int(line[0].rstrip("G"))
        result["disk_used_gb"] = int(line[1].rstrip("G"))
        result["disk_pct"] = int(line[2].rstrip("%"))
    except Exception:
        pass

    # Uptime
    try:
        result["uptime_sec"] = int(float(UPTIME_PATH.read_text().split()[0]))
    except Exception:
        pass

    return result


def _get_axcl_metrics():
    """Parse axcl-smi output for AXeLera accelerator stats."""
    result = {
        "available": False,
        "name": None,
        "temp_c": None,
        "cpu_pct": None,
        "npu_pct": None,
        "mem_used_mb": None,
        "mem_total_mb": None,
        "mem_pct": None,
        "cmm_used_mb": None,
        "cmm_total_mb": None,
        "cmm_pct": None,
        "processes": [],
    }

    try:
        out = subprocess.run(
            [AXCL_SMI], capture_output=True, text=True, timeout=5,
        )
        if out.returncode != 0:
            return result
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return result

    text = out.stdout
    result["available"] = True

    # Device name (e.g., "AX650N")
    m = re.search(r"\d+\s+(AX\w+)", text)
    if m:
        result["name"] = m.group(1)

    # Temperature (e.g., "78C")
    m = re.search(r"(\d+)C\s", text)
    if m:
        result["temp_c"] = int(m.group(1))

    # Board memory: "181 MiB / 945 MiB"
    mem_matches = re.findall(r"(\d+)\s+MiB\s*/\s*(\d+)\s+MiB", text)
    if len(mem_matches) >= 1:
        result["mem_used_mb"] = int(mem_matches[0][0])
        result["mem_total_mb"] = int(mem_matches[0][1])
        if result["mem_total_mb"] > 0:
            result["mem_pct"] = round(
                result["mem_used_mb"] / result["mem_total_mb"] * 100, 1
            )
    if len(mem_matches) >= 2:
        result["cmm_used_mb"] = int(mem_matches[1][0])
        result["cmm_total_mb"] = int(mem_matches[1][1])
        if result["cmm_total_mb"] > 0:
            result["cmm_pct"] = round(
                result["cmm_used_mb"] / result["cmm_total_mb"] * 100, 1
            )

    # CPU / NPU utilization: "1%        0%"
    util_matches = re.findall(r"(\d+)%", text)
    # First two percentages after the memory line are CPU and NPU
    # They appear on the second data row: "| -- 78C -- / -- | 1% 0% |"
    if len(util_matches) >= 2:
        result["cpu_pct"] = int(util_matches[0])
        result["npu_pct"] = int(util_matches[1])

    # Processes
    proc_section = text.split("Processes:", 1)
    if len(proc_section) > 1:
        for line in proc_section[1].splitlines():
            pm = re.match(r"\|\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+KiB", line)
            if pm:
                result["processes"].append({
                    "card": int(pm.group(1)),
                    "pid": int(pm.group(2)),
                    "name": pm.group(3).split("/")[-1],
                    "mem_kib": int(pm.group(4)),
                })

    return result
