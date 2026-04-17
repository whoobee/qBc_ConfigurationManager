"""Server configuration constants."""

from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent  # qB_Companion/
BEHAVIOR_DIR = PROJECT_ROOT / "qBc_Behavior"
TREES_DIR = BEHAVIOR_DIR / "trees"

# Defaults
DEFAULT_MQTT_BROKER = "localhost"
DEFAULT_MQTT_PORT = 1883
DEFAULT_HTTP_PORT = 8080
DEFAULT_HTTP_HOST = "0.0.0.0"

# WebSocket throttle (seconds) for high-frequency topics
WS_THROTTLE = {
    "robot/behavior/tree_state": 0.05,   # 20 Hz max
    "robot/imu/orientation":     0.05,   # cap at 20 Hz — firmware sends 20 Hz
    "robot/sensors/tof":         0.1,    # cap at 10 Hz
    "robot/odometry/pose":       0.1,    # cap at 10 Hz
}
