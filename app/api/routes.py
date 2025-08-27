# app/api/routes.py
"""
Core Game API (Blueprint) — now returns room state & interaction options on move.
"""
from __future__ import annotations
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app

from server.world_loader import load_world, get_room  # <-- import get_room
from server.player_engine import Player, move, ensure_first_quest, check_quests
from server.combat import maybe_spawn, resolve_combat

bp = Blueprint("core_api", __name__, url_prefix="/api")

STARTER_SHARD_PATH = Path("static/public/shards/00089451_test123.json")
WORLD = load_world(STARTER_SHARD_PATH)
PLAYER = Player()

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
    data = request.get_json(force=True) or {}
    x, y = int(data.get("x", 12)), int(data.get("y", 15))
    PLAYER.spawn(x, y)
    if request.args.get("noclip") == "1":
        PLAYER.flags["noclip"] = True
    ensure_first_quest(PLAYER)
    # include room snapshot on spawn for immediate UI
    room = get_room(WORLD, *PLAYER.pos).export()
    return jsonify({"ok": True, "player": PLAYER.as_public(), "room": room, "interactions": _interactions(room)})

@bp.post("/move")
def api_move():
    data = request.get_json(force=True) or {}
    dx, dy = int(data.get("dx", 0)), int(data.get("dy", 0))

    res = move(WORLD, PLAYER, dx, dy)
    log = res.get("log", [])

    # opportunistic encounter
    biome = WORLD.biome_at(*PLAYER.pos)
    try:
        enemy = maybe_spawn(biome)
    except TypeError:
        enemy = None
    if enemy:
        log += resolve_combat(PLAYER, enemy)

    # quest hooks
    check_quests(WORLD, PLAYER, log)

    # room snapshot + interaction options
    room_obj = get_room(WORLD, *PLAYER.pos)
    room = room_obj.export()

    res["player"] = PLAYER.as_public()
    res["log"] = log
    res["room"] = room
    res["interactions"] = _interactions(room)

    socketio = current_app.extensions.get("socketio")
    if socketio:
        socketio.emit("movement", res)
        if enemy:
            socketio.emit("combat", {"events": log, "player": res["player"]})
    return jsonify(res)

@bp.post("/interact")
def api_interact():
    p = WORLD.poi_at(*PLAYER.pos)
    if not p:
        return jsonify({"ok": False, "log": ["Nothing to interact with here."]})
    return jsonify({"ok": True, "poi": p, "log": [f"You arrive at a {p['type']}"]})

@bp.get("/state")
def api_state():
    room = get_room(WORLD, *PLAYER.pos).export()
    return jsonify({"player": PLAYER.as_public(), "room": room, "interactions": _interactions(room)})

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
        "gather_nodes": [n["id"] for n in (room.get("resources") or []) if n.get("qty",0) > 0],
        "enemies":     [e["id"] for e in (room.get("enemies") or [])],
    }
