# app/api/routes.py
"""
Core Game API (Blueprint) — now returns room state & interaction options on move.
"""
from __future__ import annotations
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app

from server.world_loader import load_world, get_room, add_safe_zone  # <-- import get_room
from server.player_engine import move, ensure_first_quest, check_quests
from server.combat import maybe_spawn, resolve_combat
from server.config import START_POS

from flask_login import current_user
from app.models import db, User, Character
from app.player_service import get_player, save_player

bp = Blueprint("core_api", __name__, url_prefix="/api")

STARTER_SHARD_PATH = Path("static/public/shards/00089451_test123.json")
WORLD = load_world(STARTER_SHARD_PATH)
add_safe_zone(*START_POS)
add_safe_zone(START_POS[0] + 1, START_POS[1])  # NPC tile next to spawn
WORLD.pois.append({"x": START_POS[0], "y": START_POS[1], "type": "town"})

@bp.get("/shards")
def api_shards():
    base = Path("static/public/shards")
    items = []
    for p in sorted(base.glob("*.json")):
        items.append({
            "path": f"/static/public/shards/{p.name}",
            "file": p.name,
            "meta": {"displayName": p.stem.replace("_", " ").title(), "name": p.stem},
        })
    return jsonify(items)

@bp.get("/world")
def api_world():
    return jsonify({
        "id": getattr(WORLD, "id", "starter"),
        "size": getattr(WORLD, "size", [16, 16]),
        "pois": getattr(WORLD, "pois", []),
        "roads": getattr(WORLD, "roads", []),
    })

@bp.post("/spawn")
def api_spawn():
    """Spawn the player, defaulting to the global start position.

    If an authenticated user has a selected character with stored coordinates,
    those take precedence.  Flags like ``noclip`` and ``devmode`` still work.
    """
    player = get_player()

    # default spawn
    x, y = START_POS

    # pull last known position from DB if available
    if current_user.is_authenticated:
        user = db.session.get(User, current_user.user_id)
        if user and user.selected_character_id:
            ch = Character.query.filter_by(
                character_id=user.selected_character_id,
                user_id=user.user_id,
                is_active=True,
            ).first()
            if ch and ch.x is not None and ch.y is not None:
                x, y = int(ch.x), int(ch.y)

    player.spawn(x, y)
    if request.args.get("noclip") == "1":
        player.flags["noclip"] = True
    if request.args.get("devmode") == "1":
        player.flags["devmode"] = True
    ensure_first_quest(player)
    save_player(player)
    # include room snapshot on spawn for immediate UI
    room = get_room(WORLD, *player.pos).export()
    log = [f"Spawned at ({x},{y})"]
    return jsonify({
        "ok": True,
        "player": player.as_public(),
        "room": room,
        "interactions": _interactions(room),
        "log": log,
    })

@bp.post("/move")
def api_move():
    data = request.get_json(force=True) or {}
    player = get_player()
    dx, dy = int(data.get("dx", 0)), int(data.get("dy", 0))

    res = move(WORLD, player, dx, dy)
    log = res.get("log", [])

    # opportunistic encounter
    biome = WORLD.biome_at(*player.pos)
    on_road = (player.pos in WORLD.road_tiles)
    enemy = maybe_spawn(biome, on_road)
    if enemy:
        log += resolve_combat(player, enemy)

    # quest hooks
    check_quests(WORLD, player, log)

    # room snapshot + interaction options
    room_obj = get_room(WORLD, *player.pos)
    room = room_obj.export()

    res["player"] = player.as_public()
    res["log"] = log
    res["room"] = room
    res["interactions"] = _interactions(room)


    socketio = current_app.extensions.get("socketio")
    if socketio:
        socketio.emit("movement", res)
        if enemy:
            socketio.emit("combat", {"events": log, "player": res["player"]})

    save_player(player)

    return jsonify(res)

@bp.post("/interact")
def api_interact():
    player = get_player()
    p = WORLD.poi_at(*player.pos)
    if not p:
        return jsonify({"ok": False, "log": ["Nothing to interact with here."]})
    return jsonify({"ok": True, "poi": p, "log": [f"You arrive at a {p['type']}"]})

@bp.get("/state")
def api_state():
    player = get_player()
    room = get_room(WORLD, *player.pos).export()
    return jsonify({"player": player.as_public(), "room": room, "interactions": _interactions(room)})

# ------------------------------- helpers --------------------------------------

def _interactions(room: dict) -> Dict:
    """
    Compact hints for the client so it can render buttons/menus
    without parsing the entire room payload.
    """
    return {
        "can_search": bool(room.get("searchables")),
        "can_gather": any(n.get("qty", 0) > 0 for n in (room.get("resources") or [])),
        "can_attack": bool(room.get("enemies")),
        "has_quests": bool(room.get("quests")),
        "can_talk":   bool(room.get("npcs")),
        "gather_nodes": [n["id"] for n in (room.get("resources") or []) if n.get("qty",0) > 0],
        "enemies":     [e["id"] for e in (room.get("enemies") or []) if e.get("hp_now", e.get("hp",0)) > 0],
        "npcs":        [n.get("id") for n in (room.get("npcs") or [])],
    }
