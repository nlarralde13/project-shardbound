"""Gameplay API endpoints for demo scenario."""
from __future__ import annotations

import random, datetime as dt
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from .models import (
    db,
    Character,
    CharacterState,
    Town,
    TownRoom,
    NPC,
    Quest,
    QuestState,
    Item,
    ItemInstance,
    CharacterInventory,
    User,
)
from server.config import START_TOWN_COORDS, PORT_TOWN_COORDS, AMBUSH_COORDS, TOWN_GRID_SIZE

bp = Blueprint("api_gameplay", __name__, url_prefix="/api/game")


def _grant_item(char_id: str, item_id: str, qty: int = 1, slot_start: int = 0):
    """Grant an item instance to character inventory."""
    item = Item.query.get(item_id)
    if not item:
        return
    for i in range(qty):
        inst = ItemInstance(instance_id=f"inst_{char_id}_{item_id}_{random.randint(1,999999)}",
                            item_id=item.item_id,
                            item_version=item.item_version,
                            quantity=1)
        db.session.add(inst)
        inv = CharacterInventory(id=f"inv_{inst.instance_id}",
                                  character_id=char_id,
                                  slot_index=slot_start + i,
                                  item_id=item.item_id,
                                  instance_id=inst.instance_id,
                                  qty=1,
                                  equipped=False)
        db.session.add(inv)


def _now():
    return dt.datetime.utcnow()


def _deep_merge(a, b):
    """Merge dict b into dict a (in place). Lists are replaced."""
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            _deep_merge(a[k], v)
        else:
            a[k] = v
    return a


def _get_coords(ch: Character) -> tuple[int, int]:
    if ch.last_coords:
        x = ch.last_coords.get("x")
        y = ch.last_coords.get("y")
        if x is not None and y is not None:
            return int(x), int(y)
    if ch.first_time_spawn:
        x = ch.first_time_spawn.get("x", START_TOWN_COORDS[0])
        y = ch.first_time_spawn.get("y", START_TOWN_COORDS[1])
        return int(x), int(y)
    return START_TOWN_COORDS


def _set_coords(ch: Character, x: int, y: int) -> None:
    ch.last_coords = {"x": int(x), "y": int(y)}
    ch.cur_loc = f"{int(x)},{int(y)}"
    ch.x = int(x)
    ch.y = int(y)


@bp.get("/characters")
@login_required
def list_characters():
    chars = (
        Character.query
        .filter_by(user_id=current_user.user_id, is_active=True)
        .order_by(Character.created_at.asc())
        .all()
    )
    def to_json(c: Character):
        return {
            "character_id": c.character_id,
            "name": c.name,
            "class_id": c.class_id,
            "level": c.level,
            "bio": c.biography,
            "created_at": c.created_at.isoformat() + "Z",
            "updated_at": c.updated_at.isoformat() + "Z",
            "last_seen_at": c.last_seen_at.isoformat() + "Z" if c.last_seen_at else None,
        }
    return jsonify([to_json(c) for c in chars])


@bp.post("/characters")
@login_required
def create_character():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    class_id = (data.get("class_id") or "").strip().lower()
    if not name or class_id != "warrior":
        return jsonify(error="invalid name or class"), 400
    spawn = {"x": START_TOWN_COORDS[0], "y": START_TOWN_COORDS[1]}
    ch = Character(
        user_id=current_user.user_id,
        name=name,
        class_id="warrior",
        level=1,
        first_time_spawn=spawn,
        last_coords=spawn.copy(),
        cur_loc=f"{START_TOWN_COORDS[0]},{START_TOWN_COORDS[1]}",
        x=spawn["x"],
        y=spawn["y"],
        state={},
    )
    db.session.add(ch)
    db.session.flush()
    # character state
    st = CharacterState(character_id=ch.character_id, mode="overworld")
    db.session.add(st)
    # starter kit
    _grant_item(ch.character_id, "itm_sword_wood")
    _grant_item(ch.character_id, "itm_shield_wood", slot_start=1)
    _grant_item(ch.character_id, "itm_potion_small", qty=3, slot_start=2)
    db.session.commit()
    sx, sy = _get_coords(ch)
    return jsonify(
        character_id=ch.character_id,
        name=ch.name,
        class_id=ch.class_id,
        x=sx,
        y=sy,
    ), 201


@bp.delete("/characters/<string:character_id>")
@login_required
def delete_character(character_id: str):
    ch = Character.query.filter_by(
        character_id=character_id,
        user_id=current_user.user_id,
        is_active=True,
    ).first()
    if not ch:
        return jsonify(error="not found"), 404
    ch.is_active = False
    if current_user.selected_character_id == ch.character_id:
        current_user.selected_character_id = None
    ch.updated_at = _now()
    db.session.commit()
    return jsonify(ok=True)


@bp.post("/characters/select")
@login_required
def select_character():
    data = request.get_json(force=True) or {}
    character_id = data.get("character_id")
    if not character_id:
        return jsonify(error="character_id required"), 400
    ch = Character.query.filter_by(
        character_id=character_id,
        user_id=current_user.user_id,
        is_active=True,
    ).first()
    if not ch:
        return jsonify(error="not found"), 404
    user = db.session.get(User, current_user.user_id)
    user.selected_character_id = ch.character_id
    ch.last_seen_at = _now()
    db.session.commit()
    return jsonify(ok=True)


@bp.get("/characters/active")
@login_required
def active_character():
    user = db.session.get(User, current_user.user_id)
    if not user or not user.selected_character_id:
        return jsonify(error="no active character"), 404
    ch = (
        Character.query
        .filter_by(
            character_id=user.selected_character_id,
            user_id=user.user_id,
            is_active=True,
        )
        .first()
    )
    if not ch:
        return jsonify(error="character not found"), 404
    x, y = _get_coords(ch)
    return jsonify(
        {
            "character_id": ch.character_id,
            "name": ch.name,
            "class_id": ch.class_id,
            "level": ch.level,
            "bio": ch.biography,
            "shard_id": ch.shard_id,
            "x": x,
            "y": y,
            "last_seen_at": ch.last_seen_at.isoformat() + "Z" if ch.last_seen_at else None,
        }
    )


@bp.post("/characters/autosave")
@login_required
def autosave_state():
    data = request.get_json(force=True) or {}
    user = db.session.get(User, current_user.user_id)
    if not user or not user.selected_character_id:
        return jsonify(error="no character selected"), 400
    ch = Character.query.filter_by(
        character_id=user.selected_character_id,
        user_id=user.user_id,
        is_active=True,
    ).first()
    if not ch:
        return jsonify(error="character not found"), 404

    shard_id = data.pop("shard_id", None)
    if shard_id is not None:
        ch.shard_id = shard_id
    x = data.pop("x", None)
    y = data.pop("y", None)
    if x is not None or y is not None:
        cx, cy = _get_coords(ch)
        if x is None:
            x = cx
        if y is None:
            y = cy
        _set_coords(ch, x, y)

    state_patch = data.pop("state", {})
    current = dict(ch.state or {})
    _deep_merge(current, state_patch)
    ch.state = current

    if "level" in data:
        try:
            ch.level = int(data["level"])
        except Exception:
            pass
    ch.updated_at = _now()
    ch.last_seen_at = _now()
    db.session.commit()
    return jsonify(ok=True, updated_at=ch.updated_at.isoformat() + "Z")


@bp.post("/characters/<char_id>/enter_town")
@login_required
def enter_town(char_id: str):
    ch = Character.query.get_or_404(char_id)
    if ch.user_id != current_user.user_id:
        return jsonify(error="forbidden"), 403
    x, y = _get_coords(ch)
    town = Town.query.filter_by(world_x=x, world_y=y).first()
    if not town:
        return jsonify(error="not at town"), 400
    st = CharacterState.query.get(char_id)
    if not st:
        st = CharacterState(character_id=char_id)
        db.session.add(st)
    st.mode = "town"
    st.town_id = town.town_id
    st.room_x = 1
    st.room_y = 1
    db.session.commit()
    rooms = [dict(room_x=r.room_x, room_y=r.room_y, kind=r.kind, label=r.label) for r in TownRoom.query.filter_by(town_id=town.town_id).all()]
    quest_room = random.choice([r for r in rooms if r["kind"] != "exit"]) if rooms else None
    return jsonify(town=dict(town_id=town.town_id, name=town.name), rooms=rooms, player_room=dict(x=st.room_x,y=st.room_y), quest_giver_room=dict(x=quest_room["room_x"],y=quest_room["room_y"]) if quest_room else None)


@bp.post("/characters/<char_id>/leave_town")
@login_required
def leave_town(char_id: str):
    st = CharacterState.query.get_or_404(char_id)
    st.mode = "overworld"
    st.town_id = None
    st.room_x = None
    st.room_y = None
    db.session.commit()
    return jsonify(ok=True)


@bp.post("/characters/<char_id>/town_move")
@login_required
def town_move(char_id: str):
    st = CharacterState.query.get_or_404(char_id)
    data = request.get_json(force=True) or {}
    dx, dy = data.get("dx", 0), data.get("dy", 0)
    nx = (st.room_x or 0) + dx
    ny = (st.room_y or 0) + dy
    if nx < 0 or ny < 0 or nx >= TOWN_GRID_SIZE[0] or ny >= TOWN_GRID_SIZE[1]:
        return jsonify(error="out_of_bounds"), 400
    st.room_x, st.room_y = nx, ny
    db.session.commit()
    room = TownRoom.query.filter_by(town_id=st.town_id, room_x=nx, room_y=ny).first()
    return jsonify(room=dict(room_x=nx, room_y=ny, kind=room.kind if room else "room", label=room.label if room else None))


@bp.post("/characters/<char_id>/talk")
@login_required
def talk(char_id: str):
    data = request.get_json(force=True) or {}
    npc_id = data.get("npc_id")
    st = CharacterState.query.get_or_404(char_id)
    if st.mode != "town":
        return jsonify(error="not_in_town"), 400
    if npc_id == "shady_figure":
        existing = QuestState.query.filter_by(character_id=char_id, quest_id="q_deliver_letter_001").first()
        if existing:
            return jsonify(message="We already spoke."), 200
        qs = QuestState(character_id=char_id, quest_id="q_deliver_letter_001", status="active")
        db.session.add(qs)
        _grant_item(char_id, "itm_letter_sealed", slot_start=10)
        db.session.commit()
        return jsonify(message="Quest accepted: Deliver Letter"), 200
    elif npc_id == "harbormaster":
        qs = QuestState.query.filter_by(character_id=char_id, quest_id="q_deliver_letter_001", status="active").first()
        if not qs:
            return jsonify(message="Nothing for me."), 200
        # check item
        inv = CharacterInventory.query.filter_by(character_id=char_id, item_id="itm_letter_sealed").first()
        if not inv:
            return jsonify(message="You don't have the letter."), 200
        db.session.delete(inv)
        qs.status = "completed"
        db.session.commit()
        return jsonify(message="Quest complete"), 200
    return jsonify(message="No response"), 200


@bp.post("/characters/<char_id>/move")
@login_required
def move_overworld(char_id: str):
    ch = Character.query.get_or_404(char_id)
    data = request.get_json(force=True) or {}
    dx, dy = int(data.get("dx", 0)), int(data.get("dy", 0))
    cx, cy = _get_coords(ch)
    nx, ny = cx + dx, cy + dy
    _set_coords(ch, nx, ny)
    db.session.commit()
    resp = dict(x=nx, y=ny)
    town = Town.query.filter_by(world_x=nx, world_y=ny).first()
    if town:
        resp["canEnterTown"] = True
    trig = EncounterTrigger.query.filter_by(world_x=nx, world_y=ny).first()
    if trig:
        resp["encounter"] = dict(script_id=trig.script_id)
    return jsonify(resp)


# Minimal combat stubs ------------------------------------------------------
_encounters: dict[str, dict] = {}


@bp.post("/encounters/start")
@login_required
def encounter_start():
    data = request.get_json(force=True) or {}
    script_id = data.get("script_id")
    enc = {
        "actors": ["player", "goblin1", "goblin2"],
        "hp": {"player": 10, "goblin1": 5, "goblin2": 5},
        "turn": "player",
    }
    _encounters[current_user.user_id] = enc
    return jsonify(enc)


@bp.post("/encounters/turn")
@login_required
def encounter_turn():
    enc = _encounters.get(current_user.user_id)
    if not enc:
        return jsonify(error="no encounter"), 400
    data = request.get_json(force=True) or {}
    target = data.get("target", "goblin1")
    # simple hit/miss
    if enc["turn"] == "player" and enc["hp"].get(target, 0) > 0:
        if random.random() < 0.7:
            enc["hp"][target] -= random.randint(1, 6)
    # resolve goblins
    for g in ["goblin1", "goblin2"]:
        if enc["hp"].get(g, 0) > 0 and enc["hp"]["player"] > 0:
            if random.random() < 0.5:
                enc["hp"]["player"] -= random.randint(1, 4)
    enc["turn"] = "player"
    finished = enc["hp"]["player"] <= 0 or all(enc["hp"][g] <= 0 for g in ["goblin1","goblin2"])
    enc["finished"] = finished
    if finished:
        _encounters.pop(current_user.user_id, None)
    return jsonify(enc)
