from __future__ import annotations

"""Player lookup/creation helpers.

Stores a serialized ``Player`` in the Flask session and rebuilds it on
subsequent requests.  This replaces the old module-level singleton pattern.
"""

from typing import Dict
from flask import session, current_app
from flask_login import current_user
import datetime as dt

from server.player_engine import Player, QuestState
from .models import db, User, Character


def _deserialize(data: Dict) -> Player:
    """Rebuild a :class:`Player` instance from session data."""
    player = Player()
    for key, value in data.items():
        if key == "quests_active":
            player.quests_active = {k: QuestState(**v) for k, v in value.items()}
        elif key == "quests_done":
            player.quests_done = set(value)
        else:
            setattr(player, key, value)
    return player


def get_player() -> Player:
    """Return the current player, creating one if necessary."""
    data = session.get("player")
    if data:
        return _deserialize(data)
    player = Player()
    session["player"] = player.as_public()
    return player


def save_player(player: Player) -> None:
    """Persist the player's state back to the session and database."""
    session["player"] = player.as_public()

    # Only attempt DB persistence if Flask-Login is set up
    if not hasattr(current_app, "login_manager"):
        return

    if current_user.is_authenticated:
        user = User.query.get(current_user.user_id)
        if user and user.selected_character_id:
            ch = (
                Character.query
                .filter_by(
                    character_id=user.selected_character_id,
                    user_id=user.user_id,
                    is_active=True,
                )
                .first()
            )
            if ch:
                x, y = player.pos
                ch.x = int(x)
                ch.y = int(y)
                ch.cur_loc = f"{int(x)},{int(y)}"
                ch.last_seen_at = dt.datetime.utcnow()
                db.session.commit()
