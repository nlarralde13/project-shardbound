# shard_gen.py
import json
import random
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ---------- Data model ----------

@dataclass
class ShardPOI:
    type: str                 # "settlement" | "port" | "volcano" | "landmark"
    name: str
    x: int
    y: int
    meta: Optional[dict] = None

@dataclass
class ShardMeta:
    name: str
    displayName: str
    seed: int
    width: int
    height: int
    createdAt: str
    version: str = "1.0.0"

@dataclass
class Shard:
    meta: ShardMeta
    tiles: List[List[dict]]   # 2D array: tiles[y][x] = { "biome": str }
    pois: List[ShardPOI]

# ---------- Validation & IO ----------

def validate_shard(shard: "Shard") -> None:
    w, h = shard.meta.width, shard.meta.height
    if len(shard.tiles) != h:
        raise ValueError("tiles height mismatch")
    for row in shard.tiles:
        if len(row) != w:
            raise ValueError("tiles width mismatch in row")
        for cell in row:
            if "biome" not in cell:
                raise ValueError("tile missing biome")

def save_shard(shard: "Shard", out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    validate_shard(shard)
    out = out_dir / f"{shard.meta.name}.json"
    payload = {
        "meta": asdict(shard.meta),
        "tiles": shard.tiles,
        "pois": [asdict(p) for p in shard.pois],
    }
    out.write_text(json.dumps(payload, indent=2))
    return out

# ---------- Generation helpers ----------

WATER_BIOMES = {"ocean"}
COAST_BIOME = "beach"
DEFAULT_LAND = "grassland"

def neighbors4(x: int, y: int, w: int, h: int):
    if x > 0: yield (x-1, y)
    if x < w-1: yield (x+1, y)
    if y > 0: yield (x, y-1)
    if y < h-1: yield (x, y+1)

# ---------- Main generator ----------
def generate_shard_from_registry(
    name: str,
    registry: Dict[str, dict],
    overrides: Optional[dict] = None
) -> "Shard":
    """
    Deterministic, simple landmass + coast + interior biomes + POIs.
    JSON-compatible with shard_isle_of_cinder.json.
    """
    if name not in registry:
        raise KeyError(f"'{name}' not found in registry")
    cfg = {**registry[name], **(overrides or {})}

    seed = int(cfg.get("seed", random.randrange(1_000_000)))
    rng = random.Random(seed)
    w = int(cfg.get("width", 64))
    h = int(cfg.get("height", 64))
    land_target = float(cfg.get("landmass_ratio", 0.5))
    biomes: List[str] = cfg.get("biomes", ["ocean", "grassland", "forest"])

    # 1) Start all ocean
    tiles = [[{"biome": "ocean"} for _ in range(w)] for _ in range(h)]

    # 2) Grow land blobs until land coverage ~ target
    land_count_target = int(w * h * land_target)
    land_cells = 0

    # seed a few land origins
    seeds = max(3, (w * h) // 600)
    frontier: List[Tuple[int, int]] = []
    for _ in range(seeds):
        sx, sy = rng.randrange(w), rng.randrange(h)
        tiles[sy][sx]["biome"] = DEFAULT_LAND
        frontier.append((sx, sy))
        land_cells += 1

    # random flood-fill growth
    while frontier and land_cells < land_count_target:
        x, y = frontier.pop(rng.randrange(len(frontier)))
        for nx, ny in neighbors4(x, y, w, h):
            if tiles[ny][nx]["biome"] == "ocean" and rng.random() < 0.55:
                tiles[ny][nx]["biome"] = DEFAULT_LAND
                frontier.append((nx, ny))
                land_cells += 1
                if land_cells >= land_count_target:
                    break

    # 3) Coast ring (beach around land touching ocean)
    for yy in range(h):
        for xx in range(w):
            if tiles[yy][xx]["biome"] == DEFAULT_LAND:
                for nx, ny in neighbors4(xx, yy, w, h):
                    if tiles[ny][nx]["biome"] in WATER_BIOMES:
                        tiles[yy][xx]["biome"] = COAST_BIOME
                        break

    # 4) Interior variety
    interior = []
    for yy in range(h):
        for xx in range(w):
            b = tiles[yy][xx]["biome"]
            if b not in WATER_BIOMES and b != COAST_BIOME:
                interior.append((xx, yy))
    rng.shuffle(interior)
    for (xx, yy) in interior:
        roll = rng.random()
        if "volcanic" in biomes and roll < 0.06:
            tiles[yy][xx]["biome"] = "volcanic"
        elif "forest" in biomes and roll < 0.35:
            tiles[yy][xx]["biome"] = "forest"
        elif "mountain" in biomes and roll < 0.45:
            tiles[yy][xx]["biome"] = "mountain"
        elif "hills" in biomes and roll < 0.55:
            tiles[yy][xx]["biome"] = "hills"
        else:
            tiles[yy][xx]["biome"] = DEFAULT_LAND

    # 5) POIs
    pois: List[ShardPOI] = []

    def pick_land():
        for _ in range(5000):
            xx, yy = rng.randrange(w), rng.randrange(h)
            if tiles[yy][xx]["biome"] not in WATER_BIOMES and tiles[yy][xx]["biome"] != COAST_BIOME:
                return xx, yy
        return None

    def pick_coast():
        for _ in range(5000):
            xx, yy = rng.randrange(w), rng.randrange(h)
            if tiles[yy][xx]["biome"] == COAST_BIOME:
                return xx, yy
        return None

    volcano_cfg = cfg.get("volcano", {"enabled": False})
    if volcano_cfg.get("enabled", False):
        center = pick_land()
        if center:
            vx, vy = center
            radius = rng.randint(volcano_cfg.get("min_radius", 2), volcano_cfg.get("max_radius", 4))
            r2 = radius * radius
            for yy in range(max(0, vy - radius - 1), min(h, vy + radius + 2)):
                for xx in range(max(0, vx - radius - 1), min(w, vx + radius + 2)):
                    if (xx - vx) ** 2 + (yy - vy) ** 2 <= r2:
                        tiles[yy][xx]["biome"] = "volcanic"
            pois.append(ShardPOI(type="volcano", name="Cinder Crown", x=vx, y=vy, meta={"radius": radius}))

    port_count = int(cfg.get("ports", {}).get("count", 0))
    for i in range(port_count):
        p = pick_coast()
        if p:
            pois.append(ShardPOI(type="port", name=f"Harbor {i+1}", x=p[0], y=p[1], meta={"faction": "Neutral"}))

    town_count = int(cfg.get("settlements", {}).get("count", 0))
    for i in range(town_count):
        loc = pick_land()
        if loc:
            pois.append(ShardPOI(type="settlement", name=f"Village {i+1}", x=loc[0], y=loc[1], meta={"pop": random.Random(seed+i).randint(40, 220)}))

    meta = ShardMeta(
        name=name,
        displayName=name.replace("_", " ").title(),
        seed=seed,
        width=w,
        height=h,
        createdAt=datetime.utcnow().isoformat() + "Z",
        version="1.0.0",
    )
    return Shard(meta=meta, tiles=tiles, pois=pois)
