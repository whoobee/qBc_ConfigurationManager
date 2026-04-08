#!/usr/bin/env python3
"""
qBc_ConfigurationManager

Web-based configuration, debugging, and monitoring interface for qB Companion.

Serves a Vue.js SPA with real-time MQTT bridge over WebSocket.

Features:
    - Status Dashboard: service heartbeats and system overview
    - BT Creator: visual behavior tree editor (LiteGraph.js)
    - BT Visualizer: live behavior tree state viewer
    - Extensible applet system for future tools

MQTT topics:
    Publish:
        robot/config_manager/state          (RETAIN) Service state
        robot/system/heartbeat/config_manager   Keepalive (1 Hz)

Usage:
    python3 main.py [--http-port 8080] [--mqtt-broker localhost]
"""

import argparse
import logging

import uvicorn

from server.app import create_app
from server.config import DEFAULT_HTTP_HOST, DEFAULT_HTTP_PORT, DEFAULT_MQTT_BROKER, DEFAULT_MQTT_PORT


def main():
    parser = argparse.ArgumentParser(description="qBc Configuration Manager")
    parser.add_argument("--host", default=DEFAULT_HTTP_HOST,
                        help="HTTP server bind address")
    parser.add_argument("--http-port", type=int, default=DEFAULT_HTTP_PORT,
                        help="HTTP server port")
    parser.add_argument("--mqtt-broker", default=DEFAULT_MQTT_BROKER,
                        help="MQTT broker address")
    parser.add_argument("--mqtt-port", type=int, default=DEFAULT_MQTT_PORT,
                        help="MQTT broker port")
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    app = create_app(
        mqtt_broker=args.mqtt_broker,
        mqtt_port=args.mqtt_port,
    )

    uvicorn.run(
        app,
        host=args.host,
        port=args.http_port,
        log_level=args.log_level.lower(),
    )


if __name__ == "__main__":
    main()
