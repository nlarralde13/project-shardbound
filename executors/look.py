"""Console look/where executors."""
from __future__ import annotations

from typing import Any, Dict, List

from app.player_service import get_player
from server.player_engine import can_enter
from server.world_loader import get_room

try:
    from app.api.routes import WORLD
except Exception:  # pragma: no cover
    from server.world_loader import load_world
    from pathlib import Path
    WORLD = load_world(Path("static/public/shards/00089451_test123.json"))

_DIRS = {
    "north": (0, -1),
    "south": (0, 1),
    "east": (1, 0),
    "west": (-1, 0),
}


def look() -> List[Dict]:
    """Return descriptive frames for the current room."""
    player = get_player()
    room_obj = get_room(WORLD, *player.pos)
    frames: List[Dict] = []

    name = f"{room_obj.biome} ({room_obj.x},{room_obj.y})"
    desc = f"You are in a {room_obj.biome.lower()}."
    frames.append({"type": "text", "data": name})
    frames.append({"type": "text", "data": desc})

    # exits
    exits = []
    for label, (dx, dy) in _DIRS.items():
        ok, _ = can_enter(WORLD, room_obj.x + dx, room_obj.y + dy, player)
        if ok:
            exits.append(label)
    if exits:
        frames.append({"type": "text", "data": "Exits: " + ", ".join(sorted(exits))})

    # NPCs
    npc_names = [n.get("name") for n in room_obj.npcs if n.get("name")]
    if npc_names:
        frames.append({"type": "text", "data": "NPCs: " + ", ".join(npc_names)})

    # POIs
    poi = WORLD.poi_at(room_obj.x, room_obj.y)
    if poi:
        label = poi.get("name") or poi.get("type")
        if label:
            frames.append({"type": "text", "data": "POIs: " + label})

    return frames


def where() -> List[Dict]:
    """Return current coordinates and shard/region info."""
    player = get_player()
    room_obj = get_room(WORLD, *player.pos)
    lines = [
        f"Coords: ({room_obj.x},{room_obj.y})",
        f"Shard: {WORLD.id}",
        f"Region: {room_obj.biome}",
    ]
    return [{"type": "text", "data": line} for line in lines]


def look_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict]:
    """Wrapper so ``look`` can be used with :mod:`command_router`."""
    return look()


def where_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict]:
    """Wrapper so ``where`` can be used with :mod:`command_router`."""
    return where()
