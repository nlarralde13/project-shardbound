# app/api/actions.py
"""
Actions API (Blueprint)
- Single POST /api/action entry point with verb dispatch.
- Enforces idempotency and lightweight rate limiting.
- Server-authoritative (stamina, cooldowns, etc.).
"""
from __future__ import annotations
from flask import Blueprint, request, jsonify, current_app
from server.player_engine import Player  # type hints
from server.actionRegistry import get_action
from server.services import idempotency, cooldowns
from server.services.rooms import for_player

from app.api.routes import _interactions

# Import handlers so decorators run
from server.actions import *  # noqa: F401,F403

bp = Blueprint("actions_api", __name__, url_prefix="/api")

# Replace with your real player accessor; consistent with app/api/routes.py singletons:
from app.api.routes import PLAYER as CURRENT_PLAYER  # reuse the same player singleton

@bp.post("/action")
def do_action():
    player = CURRENT_PLAYER  # (later: get from session)
    if not isinstance(player, Player):
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(force=True) or {}
    verb = data.get("verb")
    payload = data.get("payload") or {}
    action_id = data.get("action_id")

    if not verb or not action_id:
        return jsonify({"error": "missing verb/action_id"}), 400

    prior = idempotency.lookup(player.id, action_id)
    if prior:
        return jsonify(prior["result"]), 200

    handler = get_action(verb)
    if not handler:
        return jsonify({"error": "unknown_verb", "known": []}), 400

    # global micro-throttle
    if not cooldowns.allowed(player.id, "_global", min_seconds=0.1):
        return jsonify({"error":"rate_limited"}), 429

    try:
        result = handler(player=player, payload=payload)
    except Exception as e:
        return jsonify({"ok": False, "error":"server_exception", "detail": str(e)}), 500

    room = for_player(player).export()
    result.setdefault("interactions", _interactions(room))

    socketio = current_app.extensions.get("socketio")
    if socketio:
        if verb == "attack":
            socketio.emit("combat", result)
        elif verb in ("gather", "search"):
            socketio.emit("resource_update", result)

    idempotency.persist(player.id, action_id, verb, payload, result)
    return jsonify(result), 200
