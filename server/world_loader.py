# server/world_loader.py
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Tuple, Dict, Set, Optional
from collections import OrderedDict
import json, time, random

from . import persistence

Coord = Tuple[int, int]

# ------------------------ In-memory LRU cache for rooms ------------------------

class LRURoomCache(OrderedDict):
    """Basic LRU cache for storing Room instances."""

    def __init__(self, maxsize: int = 256):
        super().__init__()
        self.maxsize = maxsize

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            self.popitem(last=False)

# ------------------------ World & Room Models ------------------------

@dataclass
class Room:
    """Ephemeral-but-cached per-tile state."""
    world_id: str
    x: int
    y: int
    biome: str
    tags: List[str] = field(default_factory=list)
    # rolled at room creation
    resources: List[Dict] = field(default_factory=list)   # [{id,type,qty,respawn_s,depleted_at}]
    searchables: List[Dict] = field(default_factory=list) # [{id,type,table,once}]
    enemies: List[Dict] = field(default_factory=list)     # [{id,type,hp,level,hostile}]
    quests: List[Dict] = field(default_factory=list)      # [{id, title, status}]

    def id(self) -> str:
        return f"{self.x},{self.y}"

    def export(self) -> Dict:
        """Public shape for the client/UI."""
        return {
            "id": self.id(),
            "x": self.x, "y": self.y,
            "biome": self.biome,
            "tags": self.tags,
            "resources": self.resources,
            "searchables": self.searchables,
            "enemies": self.enemies,
            "quests": self.quests,
        }

@dataclass
class World:
    id: str
    size: Tuple[int, int]
    grid: List[List[str]]
    pois: List[Dict]
    roads: List[List[Coord]]
    road_tiles: Set[Coord]
    bridge_tiles: Set[Coord]
    blocked_land: Set[Coord]
    requires_boat: Set[Coord]
    seed: int = 0

    # cache of rolled rooms
    _rooms: Dict[Coord, Room] = field(default_factory=lambda: LRURoomCache(maxsize=256), repr=False)

    def biome_at(self, x: int, y: int) -> str:
        W, H = self.size
        if 0 <= x < W and 0 <= y < H:
            return self.grid[y][x]
        return "void"

    def poi_at(self, x: int, y: int):
        for p in self.pois:
            px = p.get("x", (p.get("pos") or [None, None])[0])
            py = p.get("y", (p.get("pos") or [None, None])[1])
            if px == x and py == y:
                return p
        return None

# ------------------------ Helpers to ingest shard JSON ------------------------

def _to_set(coords) -> Set[Coord]:
    out = set()
    for c in coords or []:
        if isinstance(c, (list, tuple)):
            x, y = c[0], c[1]
        else:
            x, y = c.get("x"), c.get("y")
        if x is not None and y is not None:
            out.add((int(x), int(y)))
    return out

def _paths_to_set(paths: List[List]) -> Set[Coord]:
    tiles = set()
    for seg in paths or []:
        for p in seg:
            if isinstance(p, (list, tuple)):
                tiles.add((int(p[0]), int(p[1])))
            else:
                tiles.add((int(p.get("x")), int(p.get("y"))))
    return tiles

# ------------------------ Load world from file ------------------------

_CURRENT_WORLD: Optional[World] = None  # optional singleton for legacy helpers

def load_world(path: str | Path) -> World:
    data = json.loads(Path(path).read_text())

    grid = data["grid"]  # fast access heatmap
    H = len(grid)
    W = len(grid[0]) if H else 0

    # POIs from settlements + sites + pois
    poi_list = []
    layers = data.get("layers", {})
    settlements = (layers.get("settlements") or {})
    for tkey in ("cities", "towns", "villages", "ports"):
        for p in settlements.get(tkey, []):
            x = p["x"] if "x" in p else p[0]
            y = p["y"] if "y" in p else p[1]
            poi_list.append({"x": int(x), "y": int(y), "type": tkey[:-1] if tkey.endswith("s") else tkey})
    poi_list += [
        {"x": s.get("x", (s.get("pos") or [None, None])[0]),
         "y": s.get("y", (s.get("pos") or [None, None])[1]),
         "type": s.get("type", "poi"),
         "name": s.get("name")}
        for s in (data.get("sites") or [])
    ]
    poi_list += [
        {"x": p.get("x"), "y": p.get("y"), "type": p.get("type", "poi"), "name": p.get("name")}
        for p in (data.get("pois") or [])
    ]

    road_layer = (layers.get("roads") or {})
    road_paths = road_layer.get("paths") or []
    bridges    = road_layer.get("bridges") or []

    road_tiles   = _paths_to_set(road_paths)
    bridge_tiles = _to_set(bridges)

    blocked     = _to_set(((layers.get("movement") or {}).get("blocked_for") or {}).get("land"))
    needs_boat  = _to_set(((layers.get("movement") or {}).get("requires")   or {}).get("boat"))

    world = World(
        id=(data.get("meta") or {}).get("name", "shard"),
        size=(W, H),
        grid=grid,
        pois=poi_list,
        roads=[[ (int(p[0]), int(p[1])) if isinstance(p,(list,tuple)) else (int(p["x"]),int(p["y"])) for p in seg ] for seg in road_paths],
        road_tiles=road_tiles,
        bridge_tiles=bridge_tiles,
        blocked_land=blocked,
        requires_boat=needs_boat,
        seed=(data.get("meta") or {}).get("seed", 0),
    )

    # expose as "current" for simple adapters that don't pass world
    global _CURRENT_WORLD
    _CURRENT_WORLD = world
    return world

# ------------------------ Room generation / respawn ------------------------

def _rng_for(world: World, x: int, y: int) -> random.Random:
    """Deterministic RNG per room so rolls are stable across sessions until state changes."""
    return random.Random(f"{world.seed}:{world.id}:{x},{y}")

def _roll_resources(world: World, x: int, y: int, biome: str, tags: List[str], rng: random.Random) -> List[Dict]:
    out: List[Dict] = []
    # super lightweight spawn tables; tweak as needed
    def node(_type: str, base_qty: Tuple[int,int]=(1,3), respawn_s: int=900) -> Dict:
        qty = rng.randint(*base_qty)
        return {"id": f"{_type}-{x}-{y}-{rng.randint(100,999)}", "type": _type, "qty": qty, "respawn_s": respawn_s, "depleted_at": None}

    if "settlement" in tags:
        # towns are safer; fewer wild resources
        if biome in ("plains","forest") and rng.random() < 0.5:
            out.append(node("wood", (1,2), respawn_s=600))
        if rng.random() < 0.3:
            out.append(node("herb", (1,2), respawn_s=600))
        return out

    if biome in ("forest","plains"):
        if rng.random() < 0.8: out.append(node("wood", (1,3)))
        if rng.random() < 0.6: out.append(node("herb", (1,3)))
        if rng.random() < 0.3: out.append(node("berry", (1,2), respawn_s=300))
    elif biome in ("hills","mountains"):
        if rng.random() < 0.7: out.append(node("stone", (1,3), respawn_s=1200))
        if rng.random() < 0.25: out.append(node("ore", (1,2), respawn_s=1800))
        if rng.random() < 0.3: out.append(node("herb", (1,2)))
    elif biome in ("coast","marsh-lite"):
        if rng.random() < 0.6: out.append(node("reeds", (1,3), respawn_s=600))
        if rng.random() < 0.4: out.append(node("shells", (1,2), respawn_s=600))
    # oceans: keep empty for now
    return out

def _roll_searchables(biome: str, tags: List[str], rng: random.Random) -> List[Dict]:
    out = []
    table = "meadow_common"
    if biome in ("forest",): table = "forest_common"
    if biome in ("coast","marsh-lite"): table = "shore_common"
    # a couple of searchable spots
    n = 1 + (1 if rng.random() < 0.4 else 0)
    for i in range(n):
        out.append({"id": f"search-{i}", "type": "forage", "table": table, "once": False})
    return out

def _roll_enemies(biome: str, tags: List[str], rng: random.Random) -> List[Dict]:
    out = []
    if "settlement" in tags or biome in ("ocean","void"):
        return out
    if biome in ("plains","forest","hills","marsh-lite","coast"):
        if rng.random() < 0.35:
            out.append({"id": f"rat-{rng.randint(100,999)}", "type":"rat", "hp": 5, "level": 1, "hostile": True})
        if rng.random() < 0.20 and biome in ("forest","hills"):
            out.append({"id": f"wolf-{rng.randint(100,999)}", "type":"wolf", "hp": 12, "level": 2, "hostile": True})
    return out

def _roll_quests(world: World, x: int, y: int, tags: List[str], rng: random.Random) -> List[Dict]:
    out = []
    if "settlement" in tags and rng.random() < 0.25:
        out.append({"id": f"errand-{x}-{y}", "title":"A Neighborly Errand", "status":"available"})
    return out

def _compute_tags(world: World, x: int, y: int, biome: str) -> List[str]:
    t: List[str] = []
    if world.poi_at(x,y):
        t.append("settlement")
    if (x,y) in world.road_tiles:
        t.append("road")
    if (x,y) in world.bridge_tiles:
        t.append("bridge")
    if (x,y) in world.blocked_land:
        t.append("blocked_land")
    if (x,y) in world.requires_boat:
        t.append("requires_boat")
    if biome == "coast":
        t.append("coast")
    if biome == "ocean":
        t.append("ocean")
    return t

def _lazy_respawn(node: Dict) -> None:
    """If depleted and respawn time elapsed, restore quantity."""
    if node.get("qty",0) > 0: return
    respawn_s = node.get("respawn_s")
    depleted_at = node.get("depleted_at")
    if not (respawn_s and depleted_at): return
    if (time.time() - depleted_at) >= respawn_s:
        # simple restore to 1–2
        node["qty"] = 1

def get_room(world: World, x: int, y: int) -> Room:
    """Fetch (or roll) room state for (x,y)."""
    key = (int(x), int(y))
    if key in world._rooms:
        room = world._rooms[key]
        # on access, allow lazy respawn updates
        for n in room.resources:
            _lazy_respawn(n)
        return room

    # try to load persisted room first
    room = persistence.load_room(world.id, *key)
    if room is not None:
        for n in room.resources:
            _lazy_respawn(n)
        world._rooms[key] = room
        return room

    biome = world.biome_at(*key)
    rng = _rng_for(world, *key)
    tags = _compute_tags(world, x, y, biome)

    room = Room(world_id=world.id, x=key[0], y=key[1], biome=biome, tags=tags)
    room.resources   = _roll_resources(world, x, y, biome, tags, rng)
    room.searchables = _roll_searchables(biome, tags, rng)
    room.enemies     = _roll_enemies(biome, tags, rng)
    room.quests      = _roll_quests(world, x, y, tags, rng)

    world._rooms[key] = room
    persistence.save_room(room)
    return room

# ------- Convenience adapters for older calls expecting a string room_id -------

def get_room_by_id(room_id: str) -> Room:
    """
    Accepts 'x,y' or 'worldId:x,y'. Uses the current world loaded via load_world().
    """
    if _CURRENT_WORLD is None:
        raise RuntimeError("No current world loaded")
    # parse coordinates
    if ":" in room_id:
        _, coords = room_id.split(":", 1)
    else:
        coords = room_id
    x_s, y_s = coords.split(",", 1)
    return get_room(_CURRENT_WORLD, int(x_s), int(y_s))
