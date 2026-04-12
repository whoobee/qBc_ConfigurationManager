"""Persistent settings REST endpoints + MQTT broadcast."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Request

logger = logging.getLogger("qBc_ConfigMgr.settings")

router = APIRouter()

SETTINGS_FILE = Path(__file__).parent.parent.parent / "settings.json"
MQTT_TOPIC_AUDIO = "robot/settings/audio"
MQTT_TOPIC_DISPLAY = "robot/settings/display"

DEFAULT_SETTINGS = {
    "audio": {
        "global_volume": 100,
        "animation_volume": 50,
        "ai_reply_volume": 50,
    },
    "display": {
        "eye_color": "orange",
    },
}


def _load_settings() -> dict:
    """Load settings from disk, falling back to defaults."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE) as f:
                data = json.load(f)
            # Merge with defaults so new keys are always present
            merged = {**DEFAULT_SETTINGS}
            for section, defaults in DEFAULT_SETTINGS.items():
                merged[section] = {**defaults, **data.get(section, {})}
            return merged
        except Exception as e:
            logger.warning("Failed to load settings: %s", e)
    return {k: dict(v) for k, v in DEFAULT_SETTINGS.items()}


def _save_settings(settings: dict):
    """Persist settings to disk."""
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


def _broadcast_audio(request: Request, audio: dict):
    """Publish audio settings to MQTT (retained) so all nodes pick them up."""
    bridge = request.app.state.mqtt_bridge
    if bridge and bridge.connected:
        bridge._client.publish(
            MQTT_TOPIC_AUDIO,
            json.dumps(audio),
            qos=1,
            retain=True,
        )


def _broadcast_display(request: Request, display: dict):
    """Publish display settings to MQTT (retained)."""
    bridge = request.app.state.mqtt_bridge
    if bridge and bridge.connected:
        bridge._client.publish(
            MQTT_TOPIC_DISPLAY,
            json.dumps(display),
            qos=1,
            retain=True,
        )


# ── Endpoints ──


@router.get("/audio")
async def get_audio_settings():
    """Return current audio volume settings."""
    return _load_settings()["audio"]


@router.put("/audio")
async def update_audio_settings(request: Request):
    """Update audio volume settings, persist, and broadcast via MQTT."""
    body = await request.json()
    settings = _load_settings()

    for key in ("global_volume", "animation_volume", "ai_reply_volume"):
        if key in body:
            settings["audio"][key] = max(0, min(100, int(body[key])))

    _save_settings(settings)
    _broadcast_audio(request, settings["audio"])
    logger.info("Audio settings updated: %s", settings["audio"])
    return settings["audio"]


@router.post("/audio/broadcast")
async def broadcast_audio_settings(request: Request):
    """Re-broadcast current audio settings (e.g. on startup)."""
    settings = _load_settings()
    _broadcast_audio(request, settings["audio"])
    return {"status": "ok"}


@router.get("/display")
async def get_display_settings():
    """Return current display settings."""
    return _load_settings()["display"]


@router.put("/display")
async def update_display_settings(request: Request):
    """Update display settings, persist, and broadcast via MQTT."""
    body = await request.json()
    settings = _load_settings()

    if "eye_color" in body:
        settings["display"]["eye_color"] = str(body["eye_color"]).lower().strip()

    _save_settings(settings)
    _broadcast_display(request, settings["display"])
    logger.info("Display settings updated: %s", settings["display"])
    return settings["display"]
