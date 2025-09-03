"""Minimal console API.

Example curl:
    curl -X POST -H 'Content-Type: application/json' \
         -d '{"line": "look"}' http://localhost:5000/api/console/exec
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_login import login_required

api_console = Blueprint("api_console", __name__)


@api_console.post("/exec")
@login_required
def exec_console():
    """Execute a console line and return frames."""
    data = request.get_json(force=True, silent=True) or {}
    line = data.get("line", "")
    if not isinstance(line, str):
        line = ""
    line = line.strip()
    context = data.get("context") if isinstance(data.get("context"), dict) else {}
    if not (1 <= len(line) <= 512):
        return jsonify({"status": "error"}), 400

    if line.lower() == "look":
        frames = [{"type": "text", "data": "You look around. Exits: N,S."}]
    else:
        frames = [{"type": "text", "data": f"echo: {line}"}]
    return jsonify({"status": "ok", "frames": frames})
