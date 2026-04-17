"""Animation file (.ani) CRUD + playback REST endpoints.

Files live in qBc_Animation/animations/ as JSON. The frontend animation
editor reads/writes them through these endpoints and can trigger playback
on the live robot via MQTT.
"""

import asyncio
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
SOUNDS_DIR = (
    Path(__file__).parent.parent.parent.parent / "qBc_Audio" / "resources" / "sounds"
)

# Animation filenames are lowercase letters, digits, underscores.
# Matches how qBc_Animation normalizes names (name.lower()).
_NAME_RE = re.compile(r"^[a-z0-9_]+$")

TOPIC_PLAY = "robot/animation/play"
TOPIC_RELOAD = "robot/animation/reload"
TOPIC_BEHAVIOR_CMD = "robot/behavior/cmd"

# Upper bound on how long we'll wait for the BT to reach a safe point
# (a non-RUNNING tick) before giving up and playing anyway. Typical
# sequences finish well under a second; 5s is generous headroom.
_SAFE_POINT_WAIT_SEC = 5.0

# Safety margin added to the computed animation duration when asking
# the BT service to auto-resume. Covers the safe-point wait itself plus
# any small scheduling jitter between the backend and the robot.
_PAUSE_MARGIN_SEC = 3.0


def _estimate_animation_duration(ani: dict) -> float:
    """Sum the relative keyframe times in an .ani file.

    random() times are treated as their midpoint — we only need a
    rough upper bound for the BT auto-resume timeout, not an exact
    playback length. Returns at least 0.5s so trivial animations still
    give the BT a moment to pick up and run.
    """
    total = 0.0
    for kf in ani.get("keyframes", []):
        t = kf.get("time", 0.0)
        if isinstance(t, (int, float)):
            total += float(t)
        elif isinstance(t, str):
            m = re.match(
                r"^\s*random\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*$", t)
            if m:
                try:
                    lo, hi = float(m.group(1)), float(m.group(2))
                    total += (lo + hi) / 2.0
                except ValueError:
                    pass
    return max(0.5, total)


def _safe_path(name: str) -> Path:
    """Resolve a name to a .ani path, rejecting traversal or bad chars."""
    if not _NAME_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail="Invalid animation name (use lowercase letters, digits, underscores)",
        )
    return ANIMATIONS_DIR / f"{name}.ani"


@router.get("/sounds")
async def list_sounds():
    """Return available sound filenames from qBc_Audio/resources/sounds/."""
    if not SOUNDS_DIR.exists():
        return []
    extensions = {".wav", ".mp3", ".ogg", ".flac"}
    return sorted(
        f.name for f in SOUNDS_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in extensions
    )


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

    Orchestration:
      1. Read the .ani so we know the animation's duration.
      2. Ask the behavior service to pause at its next safe point
         (robot/behavior/cmd {"command":"pause"}), carrying an
         auto-resume timeout that covers the full test run as a
         fail-safe against a crashed caller.
      3. Wait for robot/behavior/current_state to flip to "paused"
         so we know no Sequence / action is mid-flight. If the BT
         isn't running at all (state stays "unknown"), we proceed
         after a short wait — there's nothing to interrupt.
      4. Publish reload → play on the animation topics exactly as
         before, so qBc_Animation picks up on-disk edits and runs
         the named animation.
      5. Sleep for the animation duration so the editor button stays
         in its "busy" state for as long as the robot is actually
         playing, then publish an explicit resume to unblock the BT
         immediately instead of waiting for the auto-resume timeout.

    The endpoint is intentionally synchronous (from the frontend's
    point of view) — its blocking time is the full test run, which
    is exactly what we want the "SENDING…" state to mirror.
    """
    path = _safe_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Animation not found: {name}")

    # Read the .ani to compute duration. We deliberately parse here
    # (rather than trusting the frontend) so the backend's view of
    # the file — the thing actually sitting on disk for qBc_Animation
    # to load — is the source of truth for the pause timeout.
    try:
        ani = json.loads(path.read_text())
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse {name}.ani: {e}")
    duration = _estimate_animation_duration(ani)
    pause_timeout = duration + _SAFE_POINT_WAIT_SEC + _PAUSE_MARGIN_SEC

    bridge = request.app.state.mqtt_bridge
    try:
        # 1. Ask BT to pause at next safe point. Idempotent — rapid
        # re-clicks just extend the deadline.
        bridge.mqtt_client.publish(
            TOPIC_BEHAVIOR_CMD,
            json.dumps({"command": "pause", "timeout_sec": pause_timeout}),
            qos=1,
        )

        # 2. Wait for the BT to actually reach the safe point. Run
        # the blocking condition.wait on a worker thread so we don't
        # stall the asyncio event loop. If the BT is absent or never
        # transitions (state stays "unknown" / "running"), we time
        # out and play anyway — with nothing ticking on the BT side
        # there's nothing to interfere.
        reached = await asyncio.to_thread(
            bridge.wait_for_behavior_state, "paused", _SAFE_POINT_WAIT_SEC)
        if not reached:
            logger.warning(
                "Play-on-robot: BT did not reach safe point within %.1fs "
                "(state=%s); proceeding anyway",
                _SAFE_POINT_WAIT_SEC, bridge.behavior_state,
            )

        # 3. Reload + play. qBc_Animation's reload handler picks up
        # the on-disk edits synchronously on its next main-thread
        # tick, so the play that follows immediately after runs the
        # freshly-saved version.
        bridge.mqtt_client.publish(TOPIC_RELOAD, b"1", qos=1)
        bridge.mqtt_client.publish(
            TOPIC_PLAY,
            json.dumps({"expression": name.upper()}),
            qos=1,
        )

        logger.info(
            "Play-on-robot: %s (duration=%.2fs, safe_point=%s)",
            name, duration, "reached" if reached else "timeout",
        )

        # 4. Hold the editor's busy state for the duration of the
        # animation, then resume the BT. asyncio.sleep releases the
        # event loop for other requests.
        await asyncio.sleep(duration)

        bridge.mqtt_client.publish(
            TOPIC_BEHAVIOR_CMD,
            json.dumps({"command": "resume"}),
            qos=1,
        )
    except Exception as e:
        # Best-effort resume on failure so a bug here doesn't leave
        # the BT paused until its auto-resume deadline expires.
        try:
            bridge.mqtt_client.publish(
                TOPIC_BEHAVIOR_CMD,
                json.dumps({"command": "resume"}),
                qos=1,
            )
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"MQTT publish failed: {e}")

    return {
        "status": "ok",
        "name": name,
        "duration": round(duration, 3),
        "safe_point_reached": reached,
    }
