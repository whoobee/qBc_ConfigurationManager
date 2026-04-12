"""In-memory ring buffer for AI transcript events.

Collects transcript events from MQTT and serves them via REST API.
"""

import threading


class TranscriptStore:
    """Thread-safe ring buffer for AI transcripts."""

    def __init__(self, max_size: int = 200):
        self._buffer: list[dict] = []
        self._max = max_size
        self._lock = threading.Lock()

    def add(self, entry: dict):
        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) > self._max:
                self._buffer.pop(0)

    def get_all(self) -> list[dict]:
        with self._lock:
            return list(self._buffer)

    def clear(self):
        with self._lock:
            self._buffer.clear()

    @property
    def count(self) -> int:
        with self._lock:
            return len(self._buffer)
