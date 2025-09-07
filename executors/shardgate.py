"""Shardgate console executor.

Implements teleportation between linked shardgate nodes defined on the shard.
"""
from __future__ import annotations

from typing import Any, Dict, List

from api.player_service import get_player, save_player
from flask_login import current_user
from api.models import db
from api.models.users import User
from api.models.gameplay import CharacterDiscovery
from engine.world_loader import gate_at, gate_by_id

try:
    from api.api.routes import WORLD
except Exception:  # pragma: no cover
    from engine.world_loader import load_world
    from pathlib import Path
    WORLD = load_world(Path("client/public/shards/00089451_default.json"))


def enter_shardgate(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Teleport the player between linked shardgate nodes.

    Frames returned include a position event and two text lines.
    """
    player = get_player()
    x, y = player.pos
    here = gate_at(WORLD, x, y)
    if not here:
        return [{"type": "text", "data": "There is no shardgate here."}]
    target = gate_by_id(WORLD, here.get("link"))
    if not target:
        return [{"type": "text", "data": "The shardgate hums, but goes nowhere."}]

    # Move player and persist
    player.spawn(int(target["x"]), int(target["y"]))
    save_player(player)

    # Mark discovery of the destination gate for this character
    try:
        if current_user.is_authenticated:
            user = db.session.get(User, current_user.user_id)
            if user and user.selected_character_id:
                exists = CharacterDiscovery.query.filter_by(character_id=user.selected_character_id, shardgate_id=target.get('id')).first()
                if not exists:
                    db.session.add(CharacterDiscovery(character_id=user.selected_character_id, shardgate_id=target.get('id')))
                    db.session.commit()
    except Exception:
        db.session.rollback()

    frames = [
        {"type": "event", "data": {"name": "game:position", "payload": {"x": player.pos[0], "y": player.pos[1]}}},
        {"type": "text", "data": "You step through the Shardgate…"},
        {"type": "text", "data": f"You arrive at ({player.pos[0]}, {player.pos[1]})."},
    ]
    return frames
