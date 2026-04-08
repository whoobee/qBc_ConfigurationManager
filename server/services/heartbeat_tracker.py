"""Track service heartbeats and state from MQTT.

Runs inside the MQTT bridge thread and provides a snapshot for the REST API.
"""

import threading
import time


class HeartbeatTracker:
    """Collects heartbeat timestamps and service state for the dashboard."""

    def __init__(self):
        self._heartbeats: dict[str, float] = {}   # service_name -> last_seen
        self._states: dict[str, dict] = {}         # service_name -> state dict
        self._lock = threading.Lock()

    def record_heartbeat(self, service_name: str):
        with self._lock:
            self._heartbeats[service_name] = time.time()

    def record_state(self, service_name: str, state: dict):
        with self._lock:
            self._states[service_name] = state

    def get_snapshot(self) -> dict:
        """Return current status of all known services."""
        now = time.time()
        with self._lock:
            services = {}
            all_names = set(self._heartbeats.keys()) | set(self._states.keys())
            for name in sorted(all_names):
                last_seen = self._heartbeats.get(name)
                alive = last_seen is not None and (now - last_seen) < 5.0
                services[name] = {
                    "alive": alive,
                    "last_seen": last_seen,
                    "age": round(now - last_seen, 1) if last_seen else None,
                    "state": self._states.get(name, {}),
                }
            return services
