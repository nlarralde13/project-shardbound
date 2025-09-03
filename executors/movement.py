"""Console movement executor.

Provides simple directional movement commands that validate against the
currently loaded shard.  Moving updates the in-memory player and persists
coordinates through :func:`app.player_service.save_player` which in turn
writes to the database's ``character`` table.
"""
from __future__ import annotations

from typing import Dict, List

from app.player_service import get_player, save_player
from server.player_engine import move as engine_move
from server.world_loader import get_room

try:  # Prefer the world instance loaded by the main API routes.
    from app.api.routes import WORLD
except Exception:  # pragma: no cover - fallback for isolated executor tests
    from server.world_loader import load_world
    from pathlib import Path
    WORLD = load_world(Path("static/public/shards/00089451_test123.json"))

# Map various aliases to movement deltas; exported for dispatchers
DIRS: Dict[str, tuple[int, int]] = {
    "n": (0, -1),
    "north": (0, -1),
    "s": (0, 1),
    "south": (0, 1),
    "e": (1, 0),
    "east": (1, 0),
    "w": (-1, 0),
    "west": (-1, 0),
}


def move_command(cmd: str) -> List[Dict]:
    """Execute a movement command and return console frames.

    ``cmd`` may be any of the keys in ``DIRS`` ("n", "north", etc.).
    Returns a list of ``{"type": str, "data": any}`` frames suitable for
    :mod:`app.api_console` responses.
    """
    key = cmd.lower()
    if key not in DIRS:
        return [{"type": "text", "data": "Unknown direction."}]

    dx, dy = DIRS[key]
    player = get_player()
    res = engine_move(WORLD, player, dx, dy)

    # Persist new coordinates via player_service -> Character model
    save_player(player)

    frames: List[Dict] = []
    for line in res.get("log", []):
        frames.append({"type": "text", "data": line})

    # Always include room snapshot so clients can update their view
    room = get_room(WORLD, *player.pos).export()
    frames.append({"type": "room", "data": room})
    return frames
