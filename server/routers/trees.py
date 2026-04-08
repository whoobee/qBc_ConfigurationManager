"""Behavior tree CRUD REST endpoints."""

from fastapi import APIRouter, HTTPException, Request

from server.services import tree_service

router = APIRouter()


@router.get("/")
async def list_trees():
    """List all available tree YAML files."""
    return tree_service.list_trees()


@router.get("/schema")
async def get_schema():
    """Get the BT node type schema (categories, params, types)."""
    return tree_service.get_node_schema()


@router.get("/{filename}")
async def load_tree(filename: str):
    """Load a specific tree descriptor."""
    try:
        return tree_service.load_tree(filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tree not found: {filename}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{filename}")
async def save_tree(filename: str, request: Request):
    """Save a tree descriptor to YAML."""
    body = await request.json()
    try:
        tree_service.save_tree(filename, body)
        return {"status": "ok", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate")
async def validate_tree(request: Request):
    """Validate a tree descriptor and return errors."""
    body = await request.json()
    errors = tree_service.validate_tree(body)
    return {"valid": len(errors) == 0, "errors": errors}


@router.post("/deploy")
async def deploy_tree(request: Request):
    """Send reload command to the behavior service."""
    body = await request.json()
    filename = body.get("filename")
    bridge = request.app.state.mqtt_bridge
    import json
    if filename:
        bridge.mqtt_client.publish(
            "robot/behavior/cmd",
            json.dumps({"command": "load", "tree": filename}),
            qos=1,
        )
    else:
        bridge.mqtt_client.publish(
            "robot/behavior/cmd",
            json.dumps({"command": "reload"}),
            qos=1,
        )
    return {"status": "ok", "command": "reload"}
