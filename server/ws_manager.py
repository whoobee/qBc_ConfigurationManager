"""WebSocket connection manager.

Tracks connected clients and their MQTT topic subscriptions.
Provides fan-out broadcasting with topic-pattern matching.
"""

import asyncio
import json
import logging
import re
import time
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("qBc_ConfigMgr.ws")


def _mqtt_pattern_to_regex(pattern: str) -> re.Pattern:
    """Convert MQTT topic pattern (with + and #) to a regex."""
    parts = pattern.split("/")
    regex_parts = []
    for part in parts:
        if part == "+":
            regex_parts.append("[^/]+")
        elif part == "#":
            regex_parts.append(".*")
            break
        else:
            regex_parts.append(re.escape(part))
    return re.compile("^" + "/".join(regex_parts) + "$")


class _ClientState:
    """Per-WebSocket-client state."""

    def __init__(self, ws: WebSocket, ws_id: str):
        self.ws = ws
        self.ws_id = ws_id
        self.topic_patterns: dict[str, re.Pattern] = {}  # raw pattern -> compiled

    def matches(self, topic: str) -> bool:
        return any(rx.match(topic) for rx in self.topic_patterns.values())


class WebSocketManager:
    """Manages WebSocket connections and topic-based message routing."""

    def __init__(self):
        self._clients: dict[str, _ClientState] = {}
        self._id_counter = 0
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> str:
        """Accept a WebSocket and return its id."""
        await ws.accept()
        async with self._lock:
            self._id_counter += 1
            ws_id = f"ws_{self._id_counter}"
            self._clients[ws_id] = _ClientState(ws, ws_id)
        logger.info("Client connected: %s (total: %d)", ws_id, len(self._clients))
        # Send initial status
        await ws.send_json({
            "type": "status",
            "mqtt_connected": True,
            "client_count": len(self._clients),
        })
        return ws_id

    async def disconnect(self, ws_id: str):
        """Remove a client."""
        async with self._lock:
            self._clients.pop(ws_id, None)
        logger.info("Client disconnected: %s (total: %d)", ws_id, len(self._clients))

    def add_subscriptions(self, ws_id: str, topics: list[str]):
        """Add MQTT topic patterns for a client. Returns newly needed patterns."""
        client = self._clients.get(ws_id)
        if not client:
            return []
        new_patterns = []
        for topic in topics:
            if topic not in client.topic_patterns:
                client.topic_patterns[topic] = _mqtt_pattern_to_regex(topic)
                # Check if any other client already subscribes to this pattern
                if not any(
                    topic in c.topic_patterns
                    for cid, c in self._clients.items()
                    if cid != ws_id
                ):
                    new_patterns.append(topic)
        return new_patterns

    def remove_subscriptions(self, ws_id: str, topics: list[str]):
        """Remove topic patterns for a client. Returns patterns no longer needed."""
        client = self._clients.get(ws_id)
        if not client:
            return []
        removed = []
        for topic in topics:
            client.topic_patterns.pop(topic, None)
            # Check if any other client still needs this pattern
            if not any(topic in c.topic_patterns for c in self._clients.values()):
                removed.append(topic)
        return removed

    def get_all_patterns(self) -> set[str]:
        """Return union of all client subscription patterns."""
        patterns = set()
        for client in self._clients.values():
            patterns.update(client.topic_patterns.keys())
        return patterns

    async def broadcast_to_matching(self, topic: str, message: dict):
        """Send a message to all clients whose subscriptions match the topic."""
        data = json.dumps(message)
        disconnected = []
        for ws_id, client in list(self._clients.items()):
            if client.matches(topic):
                try:
                    await client.ws.send_text(data)
                except Exception:
                    disconnected.append(ws_id)
        for ws_id in disconnected:
            await self.disconnect(ws_id)

    async def send_to(self, ws_id: str, message: dict):
        """Send a message to a specific client."""
        client = self._clients.get(ws_id)
        if client:
            try:
                await client.ws.send_json(message)
            except Exception:
                await self.disconnect(ws_id)

    @property
    def client_count(self) -> int:
        return len(self._clients)
