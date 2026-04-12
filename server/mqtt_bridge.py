"""MQTT <-> WebSocket bridge.

Maintains a single MQTT client and fans out messages to WebSocket clients
based on their subscription patterns. Supports bidirectional communication:
  - WS->MQTT: publish commands from the browser
  - MQTT->WS: forward matching MQTT messages to subscribed clients

Implements per-topic throttling for high-frequency topics (e.g. tree_state).
"""

import asyncio
import json
import logging
import threading
import time

import paho.mqtt.client as mqtt

from server.config import WS_THROTTLE
from server.ws_manager import WebSocketManager

logger = logging.getLogger("qBc_ConfigMgr.mqtt")

# Topics the bridge always subscribes to (for system status)
_ALWAYS_SUBSCRIBE = [
    "robot/system/heartbeat/#",
    "robot/+/state",
    "robot/+/current_state",
    "robot/+/error_info",
    "robot/ai/transcript",
]

# Heartbeat topic for this service
TOPIC_HEARTBEAT = "robot/system/heartbeat/config_manager"
TOPIC_STATE = "robot/config_manager/state"
TOPIC_CURRENT_STATE = "robot/config_manager/current_state"
TOPIC_ERROR_INFO = "robot/config_manager/error_info"


class MqttBridge:
    """Bridges MQTT messages to/from WebSocket clients."""

    def __init__(self, broker: str, port: int, ws_manager: WebSocketManager):
        self.broker = broker
        self.port = port
        self._ws = ws_manager
        self._loop: asyncio.AbstractEventLoop | None = None
        self._connected = False

        # Per-topic throttle tracking
        self._last_forward: dict[str, float] = {}

        # MQTT client
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id="qbc_config_manager",
        )
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message
        self._client.will_set(
            TOPIC_STATE,
            json.dumps({"status": "offline"}),
            qos=1,
            retain=True,
        )

        # Heartbeat thread
        self._running = False
        self._hb_thread = None

    @property
    def mqtt_client(self):
        return self._client

    @property
    def connected(self) -> bool:
        return self._connected

    def start(self):
        """Connect to MQTT and start the network loop."""
        self._loop = asyncio.get_event_loop()
        self._client.connect_async(self.broker, self.port)
        self._client.loop_start()
        self._running = True
        self._hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._hb_thread.start()
        logger.info("MQTT bridge starting: %s:%d", self.broker, self.port)

    def stop(self):
        """Disconnect from MQTT."""
        self._running = False
        self._client.publish(
            TOPIC_STATE,
            json.dumps({"status": "offline"}),
            qos=1,
            retain=True,
        )
        self._client.loop_stop()
        self._client.disconnect()
        logger.info("MQTT bridge stopped")

    def _heartbeat_loop(self):
        """Publish heartbeat every second."""
        while self._running:
            if self._connected:
                self._client.publish(TOPIC_HEARTBEAT, b"1", qos=0)
            time.sleep(1.0)

    # ------------------------------------------------------------------
    # MQTT callbacks (run in paho network thread)
    # ------------------------------------------------------------------

    def _on_connect(self, client, userdata, connect_flags, reason_code, properties):
        if reason_code.is_failure:
            logger.error("MQTT connection failed: %s", reason_code)
            return
        self._connected = True
        logger.info("MQTT connected to %s:%d", self.broker, self.port)

        # Always subscribe to system topics
        for topic in _ALWAYS_SUBSCRIBE:
            client.subscribe(topic, qos=1)

        # Re-subscribe to all WebSocket client patterns
        for pattern in self._ws.get_all_patterns():
            client.subscribe(pattern, qos=1)

        # Publish online state
        client.publish(
            TOPIC_STATE,
            json.dumps({"status": "online"}),
            qos=1,
            retain=True,
        )
        client.publish(TOPIC_CURRENT_STATE, "running", qos=1, retain=True)
        client.publish(TOPIC_ERROR_INFO, "E_OK", qos=1, retain=True)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self._connected = False
        if reason_code.is_failure:
            logger.warning("MQTT disconnected: %s", reason_code)

    def _on_message(self, client, userdata, msg):
        """Forward MQTT message to matching WebSocket clients."""
        # Throttle check
        throttle = WS_THROTTLE.get(msg.topic)
        if throttle:
            now = time.monotonic()
            last = self._last_forward.get(msg.topic, 0)
            if now - last < throttle:
                return
            self._last_forward[msg.topic] = now

        try:
            payload = json.loads(msg.payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = msg.payload.decode("utf-8", errors="replace")

        envelope = {
            "type": "message",
            "topic": msg.topic,
            "payload": payload,
            "timestamp": time.time(),
        }

        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._ws.broadcast_to_matching(msg.topic, envelope),
                self._loop,
            )

    # ------------------------------------------------------------------
    # WebSocket message handling (called from async context)
    # ------------------------------------------------------------------

    async def handle_ws_message(self, ws_id: str, message: dict):
        """Route an incoming WebSocket message."""
        msg_type = message.get("type")

        if msg_type == "subscribe":
            topics = message.get("topics", [])
            new_patterns = self._ws.add_subscriptions(ws_id, topics)
            for pattern in new_patterns:
                self._client.subscribe(pattern, qos=1)
                logger.debug("MQTT subscribe: %s (for %s)", pattern, ws_id)

        elif msg_type == "unsubscribe":
            topics = message.get("topics", [])
            removed = self._ws.remove_subscriptions(ws_id, topics)
            for pattern in removed:
                self._client.unsubscribe(pattern)
                logger.debug("MQTT unsubscribe: %s", pattern)

        elif msg_type == "publish":
            topic = message.get("topic", "")
            payload = message.get("payload", {})
            qos = message.get("qos", 1)
            if topic:
                self._client.publish(topic, json.dumps(payload), qos=qos)

        else:
            await self._ws.send_to(ws_id, {
                "type": "error",
                "message": f"Unknown message type: {msg_type}",
            })
