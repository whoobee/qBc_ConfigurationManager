"""Behavior tree CRUD operations and validation.

Reuses the node schema from qBc_Behavior/loader/ as the single source of truth.

The behavior module depends on py_trees (not in our venv), so we inject a
lightweight mock before importing.  The schema data (NODE_CATEGORIES,
NODE_PARAMS, COMPOSITE_TYPES, DECORATOR_TYPES) and the topic registry are
all pure-Python dicts/sets that need no runtime py_trees classes.
"""

import json
import logging
import sys
import types
from pathlib import Path

import yaml

from server.config import BEHAVIOR_DIR, TREES_DIR

logger = logging.getLogger("qBc_ConfigMgr.trees")


# ── Mock py_trees so schema.py can be imported without the real package ──
def _install_py_trees_mock():
    """Create a minimal py_trees stub in sys.modules."""
    if "py_trees" in sys.modules:
        return
    root = types.ModuleType("py_trees")
    for sub in ("behaviour", "common", "composites", "decorators"):
        mod = types.ModuleType(f"py_trees.{sub}")
        setattr(root, sub, mod)
        sys.modules[f"py_trees.{sub}"] = mod
    # Stubs the schema references (register_all maps names to these)
    root.composites.Sequence = type("Sequence", (), {})
    root.composites.Selector = type("Selector", (), {})
    root.composites.Parallel = type("Parallel", (), {})
    root.decorators.Inverter = type("Inverter", (), {})
    root.decorators.RunningIsSuccess = type("RunningIsSuccess", (), {})
    root.decorators.FailureIsSuccess = type("FailureIsSuccess", (), {})
    root.decorators.SuccessIsFailure = type("SuccessIsFailure", (), {})
    root.behaviour.Behaviour = type("Behaviour", (), {})
    root.common.Status = type("Status", (), {
        "SUCCESS": "SUCCESS", "FAILURE": "FAILURE", "RUNNING": "RUNNING",
    })
    sys.modules["py_trees"] = root


_install_py_trees_mock()

# Now safe to add the behavior dir to path and import
sys.path.insert(0, str(BEHAVIOR_DIR))

_schema = None
_topics = None


def _load_schema():
    """Import schema data from qBc_Behavior (lazy, cached)."""
    global _schema
    if _schema is not None:
        return _schema
    try:
        from loader.schema import (
            NODE_CATEGORIES, NODE_PARAMS, COMPOSITE_TYPES, DECORATOR_TYPES,
        )
        # Serialize type references to strings for JSON transport
        params = {}
        for node_type, spec in NODE_PARAMS.items():
            entry = {}
            for section in ("required", "optional"):
                if section in spec:
                    entry[section] = {
                        k: type(v).__name__ if isinstance(v, type) else str(v)
                        for k, v in spec[section].items()
                    }
            params[node_type] = entry

        _schema = {
            "categories": NODE_CATEGORIES,
            "params": params,
            "composite_types": list(COMPOSITE_TYPES),
            "decorator_types": list(DECORATOR_TYPES),
        }
        logger.info("BT schema loaded: %d node types", len(params))
    except Exception as e:
        logger.error("Failed to load BT schema: %s", e)
        _schema = {"categories": {}, "params": {}, "composite_types": [], "decorator_types": []}
    return _schema


def _load_topics():
    """Import topic registry from qBc_Behavior (lazy, cached)."""
    global _topics
    if _topics is not None:
        return _topics
    try:
        from loader.topic_registry import INPUT_TOPICS, OUTPUT_TOPICS
        _topics = {"input": INPUT_TOPICS, "output": OUTPUT_TOPICS}
        logger.info("Topic registry loaded")
    except Exception as e:
        logger.error("Failed to load topic registry: %s", e)
        _topics = {"input": {}, "output": {}}
    return _topics


def get_node_schema() -> dict:
    """Return node type registry as JSON-serializable dict."""
    return _load_schema()


def get_topic_registry() -> dict:
    """Return the MQTT topic registry."""
    return _load_topics()


def list_trees() -> list[dict]:
    """List all .yaml tree files."""
    TREES_DIR.mkdir(parents=True, exist_ok=True)
    result = []
    for f in sorted(TREES_DIR.glob("*.yaml")):
        try:
            with open(f) as fh:
                data = yaml.safe_load(fh)
            tree_meta = data.get("tree", {})
            result.append({
                "filename": f.name,
                "name": tree_meta.get("name", f.stem),
                "description": tree_meta.get("description", ""),
                "tick_rate_hz": tree_meta.get("tick_rate_hz", 30),
            })
        except Exception:
            result.append({"filename": f.name, "name": f.stem, "description": "(parse error)"})
    return result


def load_tree(filename: str) -> dict:
    """Load a tree YAML file and return as dict."""
    filepath = TREES_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Tree file not found: {filename}")
    if not str(filepath.resolve()).startswith(str(TREES_DIR.resolve())):
        raise ValueError("Invalid file path")
    with open(filepath) as f:
        return yaml.safe_load(f)


def save_tree(filename: str, descriptor: dict):
    """Save a tree descriptor to YAML."""
    if not filename.endswith(".yaml"):
        filename += ".yaml"
    filepath = TREES_DIR / filename
    if not str(filepath.resolve()).startswith(str(TREES_DIR.resolve())):
        raise ValueError("Invalid file path")
    TREES_DIR.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w") as f:
        yaml.dump(descriptor, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    logger.info("Tree saved: %s", filepath)


def validate_tree(descriptor: dict) -> list[str]:
    """Validate a tree descriptor. Returns list of error messages."""
    _load_schema()
    errors = []

    if "tree" not in descriptor:
        errors.append("Missing 'tree' section")
    if "root" not in descriptor:
        errors.append("Missing 'root' section")
        return errors

    try:
        from loader.schema import validate_node, COMPOSITE_TYPES, DECORATOR_TYPES

        def _validate_node(node, path="root"):
            node_type = node.get("type")
            name = node.get("name", "unnamed")
            if not node_type:
                errors.append(f"{path}: missing 'type'")
                return
            if not name:
                errors.append(f"{path}: missing 'name'")

            params = node.get("params", {})
            errs = validate_node(node_type, params)
            for e in errs:
                errors.append(f"{path}/{name}: {e}")

            if node_type in COMPOSITE_TYPES:
                children = node.get("children", [])
                if not children:
                    errors.append(f"{path}/{name}: composite has no children")
                for i, child in enumerate(children):
                    _validate_node(child, f"{path}/{name}/children[{i}]")

            elif node_type in DECORATOR_TYPES:
                child = node.get("child")
                if not child:
                    errors.append(f"{path}/{name}: decorator has no child")
                elif isinstance(child, dict):
                    _validate_node(child, f"{path}/{name}/child")

        _validate_node(descriptor["root"])
    except ImportError:
        errors.append("Schema validation unavailable (qBc_Behavior not found)")

    return errors
