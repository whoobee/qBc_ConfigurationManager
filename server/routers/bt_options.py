"""BT editor options — returns available animations, sounds, joints, topics, etc.

Scans the filesystem for available resources so the BT Creator can present
dropdown lists instead of free-text inputs.
"""

import json
import logging
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger("qBc_ConfigMgr.bt_options")

router = APIRouter()

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
ANIMATIONS_DIR = PROJECT_ROOT / "qBc_Animation" / "animations"
SOUNDS_DIR = PROJECT_ROOT / "qBc_Audio" / "resources" / "sounds"
SERVO_CALIBRATION = PROJECT_ROOT / "qBc_Servos" / "servo_calibration.json"
TREES_DIR = PROJECT_ROOT / "qBc_Behavior" / "trees"

# Static options that don't need filesystem scanning
OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "in", "not_in", "exists"]

MOVEMENT_TYPES = ["linear", "quadratic", "exponential"]

COLORS = [
    "red", "green", "blue", "cyan", "magenta", "yellow",
    "white", "orange", "purple", "pink",
]

# Known MQTT topics (input topics for blackboard subscriptions / conditions)
INPUT_TOPICS = [
    "robot/audio/state",
    "robot/audio/wake_word",
    "robot/audio/recording_ready",
    "robot/vision/state",
    "robot/vision/frame_ready",
    "robot/animation/state",
    "robot/ai/state",
    "robot/ai/voice/state",
    "robot/ai/explore/state",
    "robot/ai/explore/result",
    "robot/navigation/state",
    "robot/joints/status",
    "robot/safety/status",
    "robot/odometry/pose",
    "robot/imu/orientation",
    "robot/sensors/tof",
    "robot/status/battery",
    "robot/system/heartbeat/audio",
    "robot/system/heartbeat/vision",
    "robot/system/heartbeat/animation",
    "robot/system/heartbeat/ai",
    "robot/system/heartbeat/navigation",
    "robot/system/heartbeat/behavior",
    "robot/system/heartbeat/bridge",
    "robot/system/heartbeat/teensy",
]

# Output topics (for SendCommand action)
OUTPUT_TOPICS = [
    "robot/animation/play",
    "robot/audio/play",
    "robot/audio/cmd",
    "robot/joints/cmd",
    "robot/wheels/cmd",
    "robot/vision/cmd",
    "robot/ai/explore/cmd",
    "robot/ai/voice/cmd",
    "robot/navigation/cmd",
    "robot/behavior/cmd",
]

# Blackboard keys (used in conditions — dot notation as the YAML uses)
BLACKBOARD_KEYS = [
    "audio.state",
    "vision.state",
    "animation.state",
    "ai.state",
    "ai_voice.state",
    "ai_explore.state",
    "ai_explore.state.processing",
    "navigation.state",
    "navigation.state.nav_state",
    "joints.status",
    "events.wake_word",
    "events.recording_ready",
    "events.frame_ready",
    "events.explore_result",
    "heartbeat.audio",
    "heartbeat.vision",
    "heartbeat.animation",
    "heartbeat.ai",
    "heartbeat.navigation",
]


def _scan_animations():
    """Scan animation directory for .ani files, return list of expression names."""
    if not ANIMATIONS_DIR.exists():
        return []
    names = []
    for f in sorted(ANIMATIONS_DIR.glob("*.ani")):
        names.append(f.stem)
    return names


def _scan_sounds():
    """Scan sounds directory for audio files."""
    if not SOUNDS_DIR.exists():
        return []
    extensions = {".wav", ".mp3", ".ogg", ".flac"}
    files = []
    for f in sorted(SOUNDS_DIR.iterdir()):
        if f.suffix.lower() in extensions and f.is_file():
            files.append(f.name)
    return files


def _scan_trees():
    """Scan the behavior trees directory for .yaml descriptors."""
    if not TREES_DIR.exists():
        return []
    return sorted(f.stem for f in TREES_DIR.glob("*.yaml") if f.is_file())


def _get_joints():
    """Load joint names and ranges from servo calibration."""
    if not SERVO_CALIBRATION.exists():
        return []
    try:
        data = json.loads(SERVO_CALIBRATION.read_text())
        joints = []
        for name, info in data.get("servos", {}).items():
            joints.append({
                "name": name,
                "min_deg": info.get("min_degrees", -90),
                "max_deg": info.get("max_degrees", 90),
            })
        return joints
    except Exception as e:
        logger.warning("Failed to load servo calibration: %s", e)
        return []


@router.get("/")
async def get_bt_options():
    """Return all available options for the BT Creator dropdowns."""
    joints = _get_joints()
    return {
        "animations": _scan_animations(),
        "sounds": _scan_sounds(),
        "joints": joints,
        "joint_names": [j["name"] for j in joints],
        "operators": OPERATORS,
        "movement_types": MOVEMENT_TYPES,
        "colors": COLORS,
        "input_topics": INPUT_TOPICS,
        "output_topics": OUTPUT_TOPICS,
        "all_topics": sorted(set(INPUT_TOPICS + OUTPUT_TOPICS)),
        "blackboard_keys": BLACKBOARD_KEYS,
        "trees": _scan_trees(),
    }
