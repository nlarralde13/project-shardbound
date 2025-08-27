# server/services/rooms.py
"""
Room service adapters
- Delegates to server.world_loader so all callers share the same cached Room objects.
- Provides convenience helpers for getting the player's current room.
"""

from __future__ import annotations
from typing import Tuple
from server.world_loader import get_room_by_id, get_room, _CURRENT_WORLD  # type: ignore[attr-defined]

__all__ = ["get", "player_coords", "player_room_id", "for_player"]

def get(room_id: str):
    """
    Fetch a Room by id.
    Accepts "x,y" or "worldId:x,y" (worldId is ignored when using the current world).
    """
    return get_room_by_id(room_id)

def player_coords(player) -> Tuple[int, int]:
    """
    Return the player's current (x, y) as ints.
    Works with player.pos tuple or player.x / player.y.
    Falls back to player.get_pos() or as_public() if needed.
    """
    # Preferred: tuple attribute
    if hasattr(player, "pos"):
        x, y = getattr(player, "pos")
        return int(x), int(y)

    # Common alt: separate attributes
    if hasattr(player, "x") and hasattr(player, "y"):
        return int(getattr(player, "x")), int(getattr(player, "y"))

    # Method getter
    if hasattr(player, "get_pos") and callable(getattr(player, "get_pos")):
        x, y = player.get_pos()
        return int(x), int(y)

    # Last resort: public snapshot
    if hasattr(player, "as_public"):
        pub = player.as_public()
        if isinstance(pub, dict):
            if "pos" in pub and isinstance(pub["pos"], (list, tuple)) and len(pub["pos"]) == 2:
                x, y = pub["pos"]
                return int(x), int(y)
            if "x" in pub and "y" in pub:
                return int(pub["x"]), int(pub["y"])

    raise AttributeError("Player position not found (expected .pos tuple or .x/.y).")

def player_room_id(player) -> str:
    """Return the player's current room id as 'x,y'."""
    x, y = player_coords(player)
    return f"{x},{y}"

def for_player(player, world=None):
    """
    Return the cached Room object for the player's current tile.
    If world is None, uses the currently-loaded world singleton.
    """
    x, y = player_coords(player)
    w = world or _CURRENT_WORLD
    if w is None:
        raise RuntimeError("No world loaded; call world_loader.load_world(...) first.")
    return get_room(w, x, y)
