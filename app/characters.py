# app/characters.py
import json, datetime as dt
from pathlib import Path
from flask import Blueprint, jsonify, request, render_template
from flask_login import login_required, current_user
from .models import db, User, Character
from server.config import START_POS

characters_bp = Blueprint("characters_bp", __name__)

# ----- content: published classes -----
BASE_DIR   = Path(__file__).resolve().parents[1]
PUBLISHED  = BASE_DIR / "content" / "classes" / "published"

def _load_published_classes():
    PUBLISHED.mkdir(parents=True, exist_ok=True)
    out = []
    for p in sorted(PUBLISHED.glob("*.json")):
        try:
            data = json.loads(p.read_text("utf-8"))
            out.append({
                "class_id": data["class_id"],
                "name": data.get("name"),
                "version": data.get("version"),
                "description": data.get("description", ""),
                "tags": data.get("tags", []),
                "level_cap": data.get("level_cap", 60),
                "base_attributes": data.get("base_attributes", {}),
                "per_level_gains": data.get("per_level_gains", {}),
                "skills": data.get("skills", {}),
                "abilities": data.get("abilities", []),
                "starting_equipment": data.get("starting_equipment", []),
            })
        except Exception:
            continue
    return out

def _class_by_id(cid: str):
    for c in _load_published_classes():
        if c["class_id"] == cid:
            return c
    return None

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

# ----- views (pages) -----
@characters_bp.route("/characters")
@login_required
def characters_page():
    return render_template("characters.html")

@characters_bp.route("/character-create")
@login_required
def character_create_page():
    return render_template("character_create.html")

# ----- public classes list (for creation UI) -----
@characters_bp.route("/api/classes", methods=["GET"])
@login_required
def list_published_classes():
    return jsonify(_load_published_classes()), 200

# ----- character CRUD -----
@characters_bp.route("/api/characters", methods=["GET"])
@login_required
def list_characters():
    chars = (Character.query
             .filter_by(user_id=current_user.user_id, is_active=True)
             .order_by(Character.created_at.asc())
             .all())
    def to_json(c: Character):
        return {
            "character_id": c.character_id,
            "name": c.name,
            "class_id": c.class_id,
            "level": c.level,
            "bio": c.biography,
            "created_at": c.created_at.isoformat() + "Z",
            "updated_at": c.updated_at.isoformat() + "Z",
            "last_seen_at": (c.last_seen_at.isoformat() + "Z") if c.last_seen_at else None,
        }
    return jsonify([to_json(c) for c in chars]), 200

@characters_bp.route("/api/characters", methods=["POST"])
@login_required
def create_character():
    data = request.get_json(force=True) or {}
    name     = (data.get("name") or "").strip()
    class_id = (data.get("class_id") or "").strip()
    sex      = (data.get("sex") or "").strip() or None
    age      = int(data.get("age") or 0) or None
    bio      = (data.get("bio") or "").strip() or None

    if not name or not class_id:
        return jsonify(error="name and class_id required"), 400
    exists = Character.query.filter_by(user_id=current_user.user_id, name=name, is_active=True).first()
    if exists:
        return jsonify(error="character name already used"), 409

    cdef = _class_by_id(class_id)
    if not cdef:
        return jsonify(error="invalid class_id"), 404

    initial_state = {
        "class_id": class_id,
        "race_id": data.get("race_id") or None,
        "level": 1,
        "xp": 0,
        "attributes": dict(cdef.get("base_attributes", {})),
        "skills": {k: v.get("start", 0) for k, v in (cdef.get("skills") or {}).items()},
        "abilities": {a["ability_id"]: {"rank": 1, "cooldown": 0} for a in (cdef.get("abilities") or []) if a.get("unlock_level", 1) <= 1},
        "equipment": {},
        "inventory": [{"item_id": i, "qty": 1} for i in (cdef.get("starting_equipment") or [])],
        "quests": {"active": [], "completed": []},
        "flags": {},
        "last_room_id": None,
        "hunger": 0,
        "thirst": 0,
        "buffs": []
    }

    ch = Character(
        user_id=current_user.user_id,
        name=name,
        class_id=class_id,
        level=1,
        sex=sex,
        age=age,
        biography=bio,
        shard_id="00089451_test123",
        x=START_POS[0],
        y=START_POS[1],
        state=initial_state,
        is_active=True,
        created_at=_now(),
        updated_at=_now(),
        last_seen_at=None,
    )
    db.session.add(ch)
    db.session.commit()

    return jsonify(character_id=ch.character_id), 201

@characters_bp.route("/api/characters/<string:character_id>", methods=["DELETE"])
@login_required
def delete_character(character_id):
    ch = Character.query.filter_by(character_id=character_id, user_id=current_user.user_id, is_active=True).first()
    if not ch:
        return jsonify(error="not found"), 404
    ch.is_active = False
    if current_user.selected_character_id == ch.character_id:
        current_user.selected_character_id = None
    ch.updated_at = _now()
    db.session.commit()
    return jsonify(ok=True), 200

@characters_bp.route("/api/characters/select", methods=["POST"])
@login_required
def select_character():
    data = request.get_json(force=True) or {}
    character_id = data.get("character_id")
    if not character_id:
        return jsonify(error="character_id required"), 400
    ch = Character.query.filter_by(character_id=character_id, user_id=current_user.user_id, is_active=True).first()
    if not ch:
        return jsonify(error="not found"), 404
    user = User.query.get(current_user.user_id)
    user.selected_character_id = ch.character_id
    ch.last_seen_at = _now()
    db.session.commit()
    return jsonify(ok=True), 200


@characters_bp.route("/api/characters/active", methods=["GET"])
@login_required
def active_character():
    user = User.query.get(current_user.user_id)
    if not user or not user.selected_character_id:
        return jsonify(error="no active character"), 404
    ch = (Character.query
          .filter_by(character_id=user.selected_character_id, user_id=user.user_id, is_active=True)
          .first())
    if not ch:
        return jsonify(error="character not found"), 404
    return jsonify({
        "character_id": ch.character_id,
        "name": ch.name,
        "class_id": ch.class_id,
        "level": ch.level,
        "bio": ch.biography,
        "shard_id": ch.shard_id,
        "x": ch.x,
        "y": ch.y,
        "last_seen_at": ch.last_seen_at.isoformat() + "Z" if ch.last_seen_at else None,
    }), 200

# ----- autosave (merge partial state) -----
@characters_bp.route("/api/characters/autosave", methods=["POST"])
@login_required
def autosave_state():
    data = request.get_json(force=True) or {}
    user = User.query.get(current_user.user_id)
    if not user or not user.selected_character_id:
        return jsonify(error="no character selected"), 400
    ch = Character.query.filter_by(character_id=user.selected_character_id, user_id=user.user_id, is_active=True).first()
    if not ch:
        return jsonify(error="character not found"), 404

    # update position if provided
    shard_id = data.pop("shard_id", None)
    if shard_id is not None:
        ch.shard_id = shard_id
    x = data.pop("x", None)
    if x is not None:
        ch.x = x
    y = data.pop("y", None)
    if y is not None:
        ch.y = y

    # Merge supplied state
    state_patch = data.pop("state", {})
    current = dict(ch.state or {})
    _deep_merge(current, state_patch)
    ch.state = current

    # optional: level in both column + state
    if "level" in data:
        try:
            ch.level = int(data["level"])
        except Exception:
            pass
    ch.updated_at = _now()
    ch.last_seen_at = _now()
    db.session.commit()
    return jsonify(ok=True, updated_at=ch.updated_at.isoformat() + "Z"), 200
