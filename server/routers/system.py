"""System status REST endpoints."""

from fastapi import APIRouter, Request

router = APIRouter()


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
