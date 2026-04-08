"""FastAPI application factory.

Creates the app with REST routes, WebSocket endpoint, MQTT bridge,
and serves the Vue SPA from frontend/dist/.
"""

import json
import logging
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server.mqtt_bridge import MqttBridge
from server.ws_manager import WebSocketManager
from server.services.heartbeat_tracker import HeartbeatTracker
from server.routers import trees, system

logger = logging.getLogger("qBc_ConfigMgr.app")

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
INDEX_HTML = FRONTEND_DIST / "index.html"


def create_app(mqtt_broker: str = "localhost", mqtt_port: int = 1883) -> FastAPI:
    app = FastAPI(title="qBc Configuration Manager", version="1.0.0")

    # CORS for dev (Vite dev server on :5173)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Services
    ws_manager = WebSocketManager()
    mqtt_bridge = MqttBridge(mqtt_broker, mqtt_port, ws_manager)
    heartbeat_tracker = HeartbeatTracker()

    # Wire heartbeat tracker into MQTT bridge
    _orig_on_message = mqtt_bridge._on_message

    def _tracked_on_message(client, userdata, msg):
        # Track heartbeats, state, current_state, and error_info
        topic = msg.topic
        if topic.startswith("robot/system/heartbeat/"):
            name = topic.rsplit("/", 1)[-1]
            heartbeat_tracker.record_heartbeat(name)
        elif topic.endswith("/state"):
            parts = topic.split("/")
            if len(parts) >= 3:
                name = parts[1]
                try:
                    state = json.loads(msg.payload)
                    heartbeat_tracker.record_state(name, state)
                except Exception:
                    pass
        elif topic.endswith("/current_state"):
            parts = topic.split("/")
            if len(parts) >= 3:
                name = parts[1]
                value = msg.payload.decode("utf-8", errors="replace")
                heartbeat_tracker.record_current_state(name, value)
        elif topic.endswith("/error_info"):
            parts = topic.split("/")
            if len(parts) >= 3:
                name = parts[1]
                value = msg.payload.decode("utf-8", errors="replace")
                heartbeat_tracker.record_error_info(name, value)
        _orig_on_message(client, userdata, msg)

    mqtt_bridge._on_message = _tracked_on_message
    mqtt_bridge._client.on_message = _tracked_on_message

    # Store on app state for dependency injection
    app.state.ws_manager = ws_manager
    app.state.mqtt_bridge = mqtt_bridge
    app.state.heartbeat_tracker = heartbeat_tracker

    # REST routes
    app.include_router(system.router, prefix="/api/system", tags=["System"])
    app.include_router(trees.router, prefix="/api/trees", tags=["Trees"])

    # WebSocket endpoint
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        ws_id = await ws_manager.connect(websocket)
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    await mqtt_bridge.handle_ws_message(ws_id, message)
                except json.JSONDecodeError:
                    await ws_manager.send_to(ws_id, {
                        "type": "error",
                        "message": "Invalid JSON",
                    })
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning("WebSocket error (%s): %s", ws_id, e)
        finally:
            # Clean up client subscriptions
            client = ws_manager._clients.get(ws_id)
            if client:
                patterns = list(client.topic_patterns.keys())
                ws_manager.remove_subscriptions(ws_id, patterns)
            await ws_manager.disconnect(ws_id)

    # Startup / Shutdown
    @app.on_event("startup")
    async def startup():
        mqtt_bridge.start()
        logger.info("qBc Configuration Manager started")

    @app.on_event("shutdown")
    async def shutdown():
        mqtt_bridge.stop()
        logger.info("qBc Configuration Manager stopped")

    # ── Serve Vue SPA ──
    # Static assets (JS/CSS/images) are served from /assets/ directly.
    # All other non-API GET requests fall through to index.html so that
    # Vue Router can handle client-side routes like /dashboard, /bt-creator, etc.
    if FRONTEND_DIST.exists():
        # Mount Vite build assets at /assets/
        assets_dir = FRONTEND_DIST / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        # Serve favicon and other root-level static files
        @app.get("/favicon.svg")
        async def favicon():
            return FileResponse(str(FRONTEND_DIST / "favicon.svg"))

        # SPA catch-all: serve index.html for any non-API path
        # This MUST be registered last so /api/* and /ws are matched first.
        @app.get("/{full_path:path}")
        async def spa_catch_all(request: Request, full_path: str):
            # If a real static file exists, serve it
            static_file = FRONTEND_DIST / full_path
            if static_file.is_file() and ".." not in full_path:
                return FileResponse(str(static_file))
            # Otherwise serve index.html for Vue Router
            if INDEX_HTML.exists():
                return FileResponse(str(INDEX_HTML))
            return JSONResponse({"error": "Frontend not built"}, status_code=404)
    else:
        @app.get("/")
        async def index():
            return {
                "message": "qBc Configuration Manager API",
                "hint": "Build the frontend with: cd frontend && npm run build",
                "docs": "/docs",
            }

    return app
