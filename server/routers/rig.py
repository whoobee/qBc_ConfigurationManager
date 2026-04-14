"""Rig configuration (rig.yaml) GET/PUT endpoints.

The rig file describes the 3D robot model used by the animation editor:
which OBJ/MTL files to load, where meshes sit in CAD space, and where
each servo joint's pivot is. The editor's "Rig Mode" lets the user
visually position meshes and pivots and saves back here.

File lives at frontend/resources/rig.yaml so the editor can fetch the
same file through the static /resources mount for live reloads.
"""

import logging
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("qBc_ConfigMgr.rig")

router = APIRouter()

RIG_YAML_PATH = (
    Path(__file__).parent.parent.parent / "frontend" / "resources" / "rig.yaml"
)

# Header comment preserved across saves — yaml.dump() strips comments, so
# we re-prepend this block on every write. Keeping the docs close to the
# data means rig.yaml stays hand-editable even after the GUI has touched it.
_HEADER = """\
# Rig configuration for the qB Companion animation editor.
#
# Served live from /resources/rig.yaml — edit and refresh the browser,
# no rebuild needed. Loaded by src/applets/animation-editor/viewport/rig-loader.js.
#
# Coordinate frame: CAD millimeters, Z-up. The viewport root scales by
# 0.001 (mm → m) and rotates -90° about X so CAD Z-up becomes three.js
# Y-up. Every number in this file is in CAD mm.
#
# Joint names MUST match keys in qBc_Servos/servo_calibration.json.
#
# This file is written by the Animation Editor "Rig Mode" — you can also
# edit it by hand, comments between entries will be lost on the next save.
"""


def _validate(cfg):
    if not isinstance(cfg, dict):
        raise HTTPException(status_code=400, detail="rig.yaml must be a mapping")
    if "models" not in cfg or not isinstance(cfg["models"], dict):
        raise HTTPException(status_code=400, detail="missing 'models' mapping")
    if "body" not in cfg or not isinstance(cfg["body"], dict):
        raise HTTPException(status_code=400, detail="missing 'body' mapping")
    if "joints" not in cfg or not isinstance(cfg["joints"], dict):
        raise HTTPException(status_code=400, detail="missing 'joints' mapping")


@router.get("/")
async def get_rig():
    """Return the parsed rig.yaml as JSON."""
    if not RIG_YAML_PATH.exists():
        raise HTTPException(status_code=404, detail="rig.yaml not found")
    try:
        cfg = yaml.safe_load(RIG_YAML_PATH.read_text())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse rig.yaml: {e}")
    return cfg


@router.put("/")
async def put_rig(request: Request):
    """Overwrite rig.yaml with the posted mapping.

    Body is a JSON object matching the rig.yaml schema. We round-trip
    through yaml.safe_dump so the file stays YAML (not JSON) and is still
    hand-editable.
    """
    body = await request.json()
    _validate(body)

    try:
        text = yaml.safe_dump(
            body,
            sort_keys=False,
            default_flow_style=None,
            indent=2,
            allow_unicode=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to serialize: {e}")

    try:
        RIG_YAML_PATH.parent.mkdir(parents=True, exist_ok=True)
        RIG_YAML_PATH.write_text(_HEADER + "\n" + text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write rig.yaml: {e}")

    logger.info("rig.yaml saved (%d joints)", len(body.get("joints", {})))
    return {"status": "ok"}
