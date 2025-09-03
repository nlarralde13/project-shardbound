"""API endpoint for console command execution."""
from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from .models import db, Character
import command_router as router

bp = Blueprint("console_api", __name__, url_prefix="/api/console")


@bp.post("/run")
@login_required
def run_command():
    data = request.get_json(force=True, silent=True) or {}
    line = data.get("line", "")
    char_id = data.get("character_id")
    character = Character.query.get(char_id) if char_id else None
    frames = router.route(line, current_user, character, db)
    return jsonify(frames)
