"""Minimal console API.

Example curl:
    curl -X POST -H 'Content-Type: application/json' \
         -d '{"line": "look"}' http://localhost:5000/api/console/exec
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_login import login_required
from typing import List, Dict, Any

from executors.movement import move_command, DIRS as MOVE_DIRS
from executors.look import look as exec_look, where as exec_where
from executors.shardgate import enter_shardgate as exec_enter_gate
from engine.world_loader import gate_at
from api.api.routes import WORLD
from api.player_service import get_player

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

    cmd = line.lower()

    # Map common phrases to a single intent
    ENTER_GATE_PHRASES = {"enter shardgate", "use shardgate", "enter gate"}

    frames: List[Dict[str, Any]] = []

    # Movement: single-token directions or explicit move/go <dir>
    parts = cmd.split()
    if cmd in MOVE_DIRS:
        frames = move_command(cmd)
        # mirror a position event so the client can update HUD/map
        px, py = get_player().pos
        frames.append({"type": "event", "data": {"name": "game:position", "payload": {"x": px, "y": py}}})
    elif parts[:1] in (["move"], ["go"]) and len(parts) >= 2 and parts[1] in MOVE_DIRS:
        frames = move_command(parts[1])
        px, py = get_player().pos
        frames.append({"type": "event", "data": {"name": "game:position", "payload": {"x": px, "y": py}}})
    elif cmd in ("look", "l"):
        frames = exec_look()
        # append shardgate discovery line if present
        try:
            px, py = get_player().pos
            g = gate_at(WORLD, px, py)
            if g:
                frames.append({"type": "text", "data": "There is a Shardgate here."})
                # upsert discovery
                from api.models import db
                from api.models.users import User
                from api.models.gameplay import CharacterDiscovery
                from flask_login import current_user
                if current_user.is_authenticated:
                    user = db.session.get(User, current_user.user_id)
                    if user and user.selected_character_id:
                        exists = CharacterDiscovery.query.filter_by(character_id=user.selected_character_id, shardgate_id=g.get('id')).first()
                        if not exists:
                            db.session.add(CharacterDiscovery(character_id=user.selected_character_id, shardgate_id=g.get('id')))
                            db.session.commit()
        except Exception:
            pass
    elif cmd == "where":
        frames = exec_where()
    elif cmd in ENTER_GATE_PHRASES or parts[:2] == ["enter", "shardgate"] or parts[:2] == ["use", "shardgate"]:
        frames = exec_enter_gate({"cmd": "enter_shardgate", "args": []}, {})
    else:
        frames = [{"type": "text", "data": f"echo: {line}"}]

    return jsonify({"status": "ok", "frames": frames})
