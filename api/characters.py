# app/characters.py
import json
from pathlib import Path
from flask import Blueprint, jsonify, render_template, redirect, request
from flask_login import login_required
from .models import db, Character
from services.equipment import get_loadout, equip_item, unequip_slot, EquipError
from services.derived_stats import build_snapshot

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
    return redirect("/api/game/characters", code=308)

@characters_bp.route("/api/characters", methods=["POST"])
@login_required
def create_character():
    # proxy to gameplay endpoint for backward compatibility
    from .api_gameplay import create_character as _create

    return _create()

@characters_bp.route("/api/characters/<string:character_id>", methods=["DELETE"])
@login_required
def delete_character(character_id):
    return jsonify(error="deprecated; use /api/game/characters/<id>"), 410

@characters_bp.route("/api/characters/select", methods=["POST"])
@login_required
def select_character():
    return jsonify(error="deprecated; use /api/game/characters/select"), 410


@characters_bp.route("/api/characters/active", methods=["GET"])
@login_required
def active_character():
    return jsonify(error="deprecated; use /api/game/characters/active"), 410

# ----- autosave (merge partial state) -----
@characters_bp.route("/api/characters/autosave", methods=["POST"])
@login_required
def autosave_state():
    return jsonify(error="deprecated; use /api/game/characters/autosave"), 410


# ----- equipment endpoints -----

@characters_bp.get("/api/characters/<string:character_id>/loadout")
def loadout(character_id: str):
    char = Character.query.get(character_id)
    if not char:
        return jsonify(error="not_found"), 404
    if not char.combat_snapshot:
        char.combat_snapshot = build_snapshot(character_id)
        db.session.commit()
    return jsonify(get_loadout(character_id))


@characters_bp.post("/api/characters/<string:character_id>/equip")
def api_equip(character_id: str):
    data = request.get_json() or {}
    try:
        dto = equip_item(character_id=character_id, item_instance_id=data.get("item_instance_id"), slot=data.get("slot"))
    except EquipError as e:
        return jsonify(error=e.code), 409
    return jsonify(dto)


@characters_bp.post("/api/characters/<string:character_id>/unequip")
def api_unequip(character_id: str):
    data = request.get_json() or {}
    try:
        dto = unequip_slot(character_id=character_id, slot=data.get("slot"))
    except EquipError as e:
        return jsonify(error=e.code), 409
    return jsonify(dto)


@characters_bp.post("/api/characters/<string:character_id>/recompute")
def api_recompute(character_id: str):
    char = Character.query.get(character_id)
    if not char:
        return jsonify(error="not_found"), 404
    char.combat_snapshot = build_snapshot(character_id)
    db.session.commit()
    return jsonify(get_loadout(character_id))
