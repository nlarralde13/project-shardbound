"""Movement command executors."""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from api.player_service import get_player, save_player
from engine.player_engine import move as engine_move

from executors.look import look

try:
    from api.api.routes import WORLD
except Exception:  # pragma: no cover
    from engine.world_loader import load_world
    from pathlib import Path
    WORLD = load_world(Path("client/public/shards/00089451_test123.json"))

# Direction deltas
DIRS: Dict[str, Tuple[int, int]] = {
    "n": (0, -1),
    "north": (0, -1),
    "s": (0, 1),
    "south": (0, 1),
    "e": (1, 0),
    "east": (1, 0),
    "w": (-1, 0),
    "west": (-1, 0),
}


def _move(dx: int, dy: int) -> List[Dict[str, Any]]:
    """Shared move implementation returning frame list."""
    player = get_player()
    res = engine_move(WORLD, player, dx, dy)
    frames = [{"type": "text", "data": line} for line in res.get("log", [])]
    if res.get("ok"):
        save_player(player)
    return frames


def move(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Move the player in the direction specified by ``cmd``."""
    direction = cmd.get("cmd")
    if cmd.get("args"):
        direction = cmd["args"][0]
    delta = DIRS.get(direction or "")
    if not delta:
        return [{"type": "text", "data": "Unknown direction."}]
    return _move(*delta)


def move_command(token: str) -> List[Dict[str, Any]]:
    """Simpler movement helper for ``api_console``.

    ``token`` is expected to be a direction string like ``"n"`` or ``"east"``.
    Successful moves append a ``look`` after movement to reflect the new room.
    """
    delta = DIRS.get(token.lower())
    if not delta:
        return [{"type": "text", "data": "Unknown direction."}]
    frames = _move(*delta)
    # Show new room on successful move
    frames.extend(look())
    return frames

