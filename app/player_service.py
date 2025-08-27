from __future__ import annotations

"""Player lookup/creation helpers.

Stores a serialized ``Player`` in the Flask session and rebuilds it on
subsequent requests.  This replaces the old module-level singleton pattern.
"""

from typing import Dict
from flask import session

from server.player_engine import Player, QuestState


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
    """Persist the player's state back to the session."""
    session["player"] = player.as_public()
