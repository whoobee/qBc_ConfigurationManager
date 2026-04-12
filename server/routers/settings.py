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
MQTT_TOPIC_AI = "robot/settings/ai"
MQTT_TOPIC_NAVIGATION = "robot/settings/navigation"

VALID_LANGUAGES = ("en", "ro", "de")

DEFAULT_SETTINGS = {
    "audio": {
        "global_volume": 100,
        "animation_volume": 50,
        "ai_reply_volume": 50,
    },
    "display": {
        "eye_color": "orange",
    },
    "ai": {
        "language": "en",
    },
    "navigation": {
        "neck_deadzone": 0.03,
        "neck_invert": False,
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


def _broadcast_ai(request: Request, ai_settings: dict):
    """Publish AI settings to MQTT (retained)."""
    bridge = request.app.state.mqtt_bridge
    if bridge and bridge.connected:
        bridge._client.publish(
            MQTT_TOPIC_AI,
            json.dumps(ai_settings),
            qos=1,
            retain=True,
        )


def _broadcast_navigation(request: Request, nav_settings: dict):
    """Publish navigation settings to MQTT (retained)."""
    bridge = request.app.state.mqtt_bridge
    if bridge and bridge.connected:
        bridge._client.publish(
            MQTT_TOPIC_NAVIGATION,
            json.dumps(nav_settings),
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


@router.get("/ai")
async def get_ai_settings():
    """Return current AI settings (language, etc.)."""
    return _load_settings()["ai"]


@router.put("/ai")
async def update_ai_settings(request: Request):
    """Update AI settings, persist, and broadcast via MQTT."""
    body = await request.json()
    settings = _load_settings()

    if "language" in body:
        lang = str(body["language"]).lower().strip()
        if lang in VALID_LANGUAGES:
            settings["ai"]["language"] = lang
        else:
            logger.warning("Invalid language code: %s", lang)

    _save_settings(settings)
    _broadcast_ai(request, settings["ai"])
    logger.info("AI settings updated: %s", settings["ai"])
    return settings["ai"]


@router.get("/navigation")
async def get_navigation_settings():
    """Return current navigation settings."""
    return _load_settings()["navigation"]


@router.put("/navigation")
async def update_navigation_settings(request: Request):
    """Update navigation settings, persist, and broadcast via MQTT."""
    body = await request.json()
    settings = _load_settings()

    if "neck_deadzone" in body:
        val = float(body["neck_deadzone"])
        settings["navigation"]["neck_deadzone"] = max(0.0, min(0.72, val))

    if "neck_invert" in body:
        settings["navigation"]["neck_invert"] = bool(body["neck_invert"])

    _save_settings(settings)
    _broadcast_navigation(request, settings["navigation"])
    logger.info("Navigation settings updated: %s", settings["navigation"])
    return settings["navigation"]
