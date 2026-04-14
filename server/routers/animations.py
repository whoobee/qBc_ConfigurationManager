"""Animation file (.ani) CRUD + playback REST endpoints.

Files live in qBc_Animation/animations/ as JSON. The frontend animation
editor reads/writes them through these endpoints and can trigger playback
on the live robot via MQTT.
"""

import json
import logging
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("qBc_ConfigMgr.animations")

router = APIRouter()

ANIMATIONS_DIR = (
    Path(__file__).parent.parent.parent.parent / "qBc_Animation" / "animations"
)

# Animation filenames are lowercase letters, digits, underscores.
# Matches how qBc_Animation normalizes names (name.lower()).
_NAME_RE = re.compile(r"^[a-z0-9_]+$")

TOPIC_PLAY = "robot/animation/play"
TOPIC_RELOAD = "robot/animation/reload"


def _safe_path(name: str) -> Path:
    """Resolve a name to a .ani path, rejecting traversal or bad chars."""
    if not _NAME_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail="Invalid animation name (use lowercase letters, digits, underscores)",
        )
    return ANIMATIONS_DIR / f"{name}.ani"


@router.get("/")
async def list_animations():
    """List all .ani files with their name and keyframe count."""
    if not ANIMATIONS_DIR.exists():
        return []
    out = []
    for path in sorted(ANIMATIONS_DIR.glob("*.ani")):
        try:
            data = json.loads(path.read_text())
            out.append({
                "name": data.get("name", path.stem),
                "filename": path.name,
                "loop": bool(data.get("loop", False)),
                "keyframe_count": len(data.get("keyframes", [])),
                "sound": data.get("sound"),
            })
        except Exception as e:
            logger.warning("Failed to read %s: %s", path.name, e)
            out.append({
                "name": path.stem,
                "filename": path.name,
                "error": str(e),
            })
    return out


@router.get("/{name}")
async def get_animation(name: str):
    """Return a single animation's raw JSON."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Animation not found: {name}")
    try:
        return json.loads(path.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse: {e}")


@router.put("/{name}")
async def save_animation(name: str, request: Request):
    """Write (create or overwrite) an animation file.

    Body must be a valid .ani JSON document. The 'name' field in the body
    is forced to match the URL name so filename and internal name stay in
    sync.
    """
    path = _safe_path(name)
    body = await request.json()

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    if "keyframes" not in body or not isinstance(body["keyframes"], list):
        raise HTTPException(status_code=400, detail="Missing 'keyframes' array")
    if not body["keyframes"]:
        raise HTTPException(status_code=400, detail="Animation must have at least one keyframe")

    body["name"] = name  # force-sync name to filename

    ANIMATIONS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(json.dumps(body, indent=2))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write: {e}")

    logger.info("Saved animation: %s (%d keyframes)", name, len(body["keyframes"]))
    return {"status": "ok", "name": name, "filename": path.name}


@router.delete("/{name}")
async def delete_animation(name: str):
    """Delete an animation file."""
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Animation not found: {name}")
    try:
        path.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {e}")
    logger.info("Deleted animation: %s", name)
    return {"status": "ok", "name": name}


@router.post("/{name}/play")
async def play_animation(name: str, request: Request):
    """Trigger playback of an animation on the live robot via MQTT.

    First publishes a reload command so qBc_Animation picks up any on-disk
    edits, then publishes the play command. The reload handler is added in
    qBc_Animation/qBc_Animation/server.py.
    """
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Animation not found: {name}")

    bridge = request.app.state.mqtt_bridge
    try:
        bridge.mqtt_client.publish(TOPIC_RELOAD, b"1", qos=1)
        bridge.mqtt_client.publish(
            TOPIC_PLAY,
            json.dumps({"expression": name.upper()}),
            qos=1,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MQTT publish failed: {e}")

    logger.info("Play-on-robot requested: %s", name)
    return {"status": "ok", "name": name}
