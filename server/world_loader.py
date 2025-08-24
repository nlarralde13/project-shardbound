# server/world_loader.py
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple, Dict, Set
import json

Coord = Tuple[int, int]

@dataclass
class World:
    id: str
    size: Tuple[int, int]
    grid: List[List[str]]
    pois: List[Dict]
    roads: List[List[Coord]]
    road_tiles: Set[Coord]
    blocked_land: Set[Coord]
    requires_boat: Set[Coord]

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

def _roads_to_set(paths: List[List]) -> Set[Coord]:
    tiles = set()
    for seg in paths or []:
        for p in seg:
            if isinstance(p, (list, tuple)):
                tiles.add((int(p[0]), int(p[1])))
            else:
                tiles.add((int(p.get("x")), int(p.get("y"))))
    return tiles

def load_world(path: str | Path) -> World:
    data = json.loads(Path(path).read_text())

    # Basic size
    grid = data["grid"]
    H = len(grid)
    W = len(grid[0]) if H else 0

    # POIs: prefer layers.settlements + sites/pois fallback
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

    # Roads
    road_paths = (layers.get("roads") or {}).get("paths") or []
    road_tiles = _roads_to_set(road_paths)

    # Movement restrictions (fallbacks are empty if not present)
    blocked = _to_set(((layers.get("movement") or {}).get("blocked_for") or {}).get("land"))
    needs_boat = _to_set(((layers.get("movement") or {}).get("requires") or {}).get("boat"))

    return World(
        id=(data.get("meta") or {}).get("name", "shard"),
        size=(W, H),
        grid=grid,
        pois=poi_list,
        roads=[[ (int(p[0]), int(p[1])) if isinstance(p,(list,tuple)) else (int(p["x"]),int(p["y"])) for p in seg ] for seg in road_paths],
        road_tiles=road_tiles,
        blocked_land=blocked,
        requires_boat=needs_boat,
    )
