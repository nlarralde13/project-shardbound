from __future__ import annotations

import re
from pathlib import Path
from typing import List
import json

from flask import Blueprint, jsonify, request


bp = Blueprint("api_shards_fs", __name__, url_prefix="/api/shards")

ROOT = Path(__file__).resolve().parents[1]
SHARDS_DIR = ROOT / "static" / "public" / "shards"
SHARDS_DIR.mkdir(parents=True, exist_ok=True)

SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]+$")


def _files() -> List[Path]:
    return sorted(SHARDS_DIR.glob("*.json"))


@bp.get("")
def list_shards():
    items = [p.name for p in _files()]
    return jsonify(items)


@bp.get("/<name>")
def get_shard(name: str):
    if name.endswith(".json"):
        name = name[:-5]
    if not SAFE_NAME.match(name):
        return jsonify({"error": "invalid name"}), 400
    p = SHARDS_DIR / f"{name}.json"
    if not p.exists():
        return jsonify({"error": "not found"}), 404
    try:
        return jsonify(json.loads(p.read_text()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.put("/<name>")
def put_shard(name: str):
    if name.endswith(".json"):
        name = name[:-5]
    if not SAFE_NAME.match(name):
        return jsonify({"error": "invalid name"}), 400
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "json body required"}), 400
    p = SHARDS_DIR / f"{name}.json"
    try:
        # simple backup
        if p.exists():
            (SHARDS_DIR / f"{name}.json.bak").write_text(p.read_text())
        p.write_text(json.dumps(body, indent=2))
        return jsonify({"ok": True, "file": p.name, "path": f"/static/public/shards/{p.name}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

