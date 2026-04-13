"""Navigation streaming router — serves MJPEG from latest_frame.jpg.

Only requests camera frames while a viewer is actually connected.
During navigation, the servoing loop already writes annotated frames
so no extra captures are needed.
"""

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("qBc_ConfigMgr.navigation")

router = APIRouter()

NAV_TEMP_DIR = Path(__file__).parent.parent.parent.parent / "qBc_Navigation" / "temp"
# Debug frames are now written to shared memory for low-latency streaming
SHM_FRAME = Path("/dev/shm/qb_debug_frame.jpg")
# Fallback to disk path for backward compatibility
DISK_FRAME = NAV_TEMP_DIR / "latest_frame.jpg"

TOPIC_STREAM_REQ = "robot/navigation/stream/request"

# Stream parameters — match the servoing frame rate for real-time debug view
STREAM_FPS = 15
FRAME_INTERVAL = 1.0 / STREAM_FPS

# Track active viewers so the navigation service knows when to stop
_active_viewers = 0


@router.get("/stream")
async def stream_mjpeg(request: Request):
    """MJPEG stream of the navigation camera feed."""
    bridge = request.app.state.mqtt_bridge

    return StreamingResponse(
        _frame_generator(bridge),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


async def _frame_generator(bridge):
    """Yield JPEG frames. Publishes frame requests only while active."""
    global _active_viewers
    _active_viewers += 1
    last_mtime = 0.0
    logger.info("Stream viewer connected (active: %d)", _active_viewers)

    try:
        while True:
            # Request a fresh frame from the navigation service
            try:
                bridge._client.publish(TOPIC_STREAM_REQ, b"1", qos=0)
            except Exception:
                pass

            await asyncio.sleep(FRAME_INTERVAL)

            try:
                # Prefer SHM (RAM-backed), fall back to disk
                frame_path = SHM_FRAME if SHM_FRAME.exists() else DISK_FRAME
                if frame_path.exists():
                    mtime = frame_path.stat().st_mtime
                    if mtime != last_mtime:
                        frame_data = frame_path.read_bytes()
                        # Validate JPEG: must start with SOI and end with EOI marker
                        if (frame_data
                                and len(frame_data) > 4
                                and frame_data[:2] == b"\xff\xd8"
                                and frame_data[-2:] == b"\xff\xd9"):
                            last_mtime = mtime
                            yield (
                                b"--frame\r\n"
                                b"Content-Type: image/jpeg\r\n"
                                b"Content-Length: " + str(len(frame_data)).encode() + b"\r\n"
                                b"\r\n" + frame_data + b"\r\n"
                            )
            except (OSError, IOError):
                pass
    except (GeneratorExit, asyncio.CancelledError):
        pass
    finally:
        _active_viewers -= 1
        logger.info("Stream viewer disconnected (active: %d)", _active_viewers)
        # Clean temp when last viewer leaves
        if _active_viewers <= 0:
            _active_viewers = 0
            _cleanup_temp()


def _cleanup_temp():
    """Remove all files from the navigation temp directory."""
    try:
        if NAV_TEMP_DIR.exists():
            for f in NAV_TEMP_DIR.iterdir():
                try:
                    f.unlink()
                except OSError:
                    pass
        logger.info("Navigation temp cleaned")
    except Exception:
        pass
