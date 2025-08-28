# app/characters.py
import datetime as dt
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from .db import db
from .models import Character, User

characters_bp = Blueprint("characters_bp", __name__, url_prefix="/api/characters")

def serialize_char(c: Character):
    return dict(
        character_id=c.character_id, name=c.name, class_id=c.class_id,
        sex=c.sex, age=c.age, bio=c.bio, level=c.level, xp=c.xp,
        shard_id=c.shard_id, x=c.x, y=c.y, state=c.state or {},
        created_at=c.created_at.isoformat(), updated_at=c.updated_at.isoformat()
    )

@characters_bp.route("", methods=["GET"])
@login_required
def list_characters():
    q = Character.query.filter_by(user_id=current_user.user_id, is_deleted=False).order_by(Character.created_at.asc())
    chars = [serialize_char(c) for c in q.all()]
    return jsonify(chars), 200

@characters_bp.route("", methods=["POST"])
@login_required
def create_character():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="Name required."), 400

    # Optional: enforce unique name per user
    if Character.query.filter_by(user_id=current_user.user_id, name=name, is_deleted=False).first():
        return jsonify(error="You already have a character with that name."), 409

    c = Character(
        user_id=current_user.user_id,
        name=name,
        class_id=(data.get("class_id") or "").strip() or None,
        sex=(data.get("sex") or "").strip() or None,
        age=data.get("age") if data.get("age") is not None else None,
        bio=(data.get("bio") or "").strip() or None,
        shard_id=data.get("shard_id") or "00089451_test123",
        x=data.get("x") if data.get("x") is not None else 12,
        y=data.get("y") if data.get("y") is not None else 15,
        state=data.get("state") or {}
    )
    db.session.add(c)
    db.session.flush()

    # Set as active on creation
    u: User = current_user
    u.selected_character_id = c.character_id
    u.updated_at = dt.datetime.utcnow()
    db.session.commit()

    return jsonify(serialize_char(c)), 201

@characters_bp.route("/select", methods=["POST"])
@login_required
def select_character():
    data = request.get_json(force=True) or {}
    char_id = data.get("character_id")
    if not char_id:
        return jsonify(error="character_id required"), 400

    c = Character.query.filter_by(character_id=char_id, user_id=current_user.user_id, is_deleted=False).first()
    if not c:
        return jsonify(error="Character not found."), 404

    current_user.selected_character_id = c.character_id
    current_user.updated_at = dt.datetime.utcnow()
    db.session.commit()
    return jsonify(serialize_char(c)), 200

@characters_bp.route("/active", methods=["GET"])
@login_required
def active_character():
    if not current_user.selected_character_id:
        return jsonify(error="No active character."), 404
    c = Character.query.filter_by(character_id=current_user.selected_character_id, user_id=current_user.user_id, is_deleted=False).first()
    if not c:
        return jsonify(error="Active character not found."), 404
    return jsonify(serialize_char(c)), 200

@characters_bp.route("/autosave", methods=["PATCH", "POST"])
@login_required
def autosave():
    """Lightweight autosave for current user's active character."""
    if not current_user.selected_character_id:
        return jsonify(error="No active character."), 404
    c = Character.query.filter_by(character_id=current_user.selected_character_id, user_id=current_user.user_id, is_deleted=False).first()
    if not c:
        return jsonify(error="Active character not found."), 404

    data = request.get_json(force=True) or {}

    # allowed fields (partial)
    for k in ("shard_id", "x", "y"):
        if k in data:
            setattr(c, k, data[k])

    # merge state shallowly
    if "state" in data and isinstance(data["state"], dict):
        c.state = {**(c.state or {}), **data["state"]}

    c.updated_at = dt.datetime.utcnow()
    db.session.commit()
    return jsonify(ok=True, character=serialize_char(c)), 200
