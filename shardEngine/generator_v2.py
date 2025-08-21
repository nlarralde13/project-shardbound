# /app/shardEngine/generator_v2.py
from __future__ import annotations
from typing import Any, Dict, List

from .schemas import (
    PlanRequest, PlanResponse, GridSpec, Provenance, DiffBlock, BudgetsBlock,
    WaterLayerPlan, HydrologyRequested, HydrologyLayerPlan, RiverSource, LakeSeed,
    BiomeAssignment, BiomesLayerPlan, SettlementsLayerPlan, SettlementPick,
    RoadsLayerPlan, POILayerPlan, POIPick,
    ResourcesLayerPlan, LayersBlock,
    TileCountsEstimate, ConnectivityMetrics, MetricsBlock,
    WouldWriteBlock, CompatBlock,
)
from .registry import OverrideDiff, LoadedDoc, overrides_hash_sha1
from .rng import KeyedRNG
from .persistence import save_shard_v2
from collections import deque
from typing import Tuple, Set


# ---------- tiny utils ----------
def _iso_now():
    from datetime import datetime
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

def _ring_count(w: int, h: int, t: int) -> int:
    if t <= 0:
        return 0
    iw, ih = max(0, w - 2 * t), max(0, h - 2 * t)
    total = w * h
    return total if iw <= 0 or ih <= 0 else total - (iw * ih)

def _coast_count(w: int, h: int, ocean_ring: int, coast_width: int) -> int:
    return max(0, _ring_count(w, h, ocean_ring + coast_width) - _ring_count(w, h, ocean_ring))

def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))

def _weighted_pick(rng: KeyedRNG, key: str, weights: Dict[str, float], fallback: str = "plains") -> str:
    total = sum(max(0.0, float(w)) for w in weights.values()) or 0.0
    if total <= 0:
        return fallback
    r = rng.randf(key) * total
    acc = 0.0
    for k, w in weights.items():
        acc += max(0.0, float(w))
        if r <= acc:
            return k
    return fallback

def _pick_coast_biome(rng: KeyedRNG, key: str, coast_entries: List) -> str:
    # entries may be {"id","weight"} dicts or plain strings
    items = []
    total = 0.0
    for e in coast_entries:
        if isinstance(e, dict):
            bi = e.get("id", "coast")
            wt = float(e.get("weight", 1.0))
        else:
            bi, wt = str(e), 1.0
        items.append((bi, wt))
        total += max(0.0, wt)
    if total <= 0:
        return "coast"
    r = rng.randf(key) * total
    acc = 0.0
    for bi, wt in items:
        acc += max(0.0, wt)
        if r <= acc:
            return bi
    return "coast"

# -------------- Hydrology helpers (no elevation) -----------------

def _neighbors4(x: int, y: int, W: int, H: int):
    if x+1 < W: yield (x+1, y)
    if x-1 >= 0: yield (x-1, y)
    if y+1 < H: yield (x, y+1)
    if y-1 >= 0: yield (x, y-1)

def _compute_dist_to_ocean(grid: List[List[str]]) -> List[List[int]]:
    """Multi-source BFS distance (4-neigh) to the nearest ocean tile. -1 = unreachable."""
    H = len(grid); W = len(grid[0]) if H else 0
    dist = [[-1]*W for _ in range(H)]
    q = deque()
    for y in range(H):
        for x in range(W):
            if grid[y][x] == "ocean":
                dist[y][x] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        d = dist[y][x] + 1
        for nx, ny in _neighbors4(x, y, W, H):
            if dist[ny][nx] == -1:
                dist[ny][nx] = d
                q.append((nx, ny))
    return dist

def _pick_river_sources(rng: KeyedRNG, dist: List[List[int]], count: int, min_dist: int = 3) -> List[Tuple[int,int]]:
    """Choose up to `count` distinct interior cells with largest distance to ocean."""
    H = len(dist); W = len(dist[0]) if H else 0
    candidates = [(dist[y][x], rng.randf(f"hyd.src.tie.{x}.{y}"), x, y)
                  for y in range(H) for x in range(W) if dist[y][x] >= min_dist]
    # Sort by (distance desc, rng tie desc) and take top-N
    candidates.sort(key=lambda t: (t[0], t[1]), reverse=True)
    picks: List[Tuple[int,int]] = []
    used: Set[Tuple[int,int]] = set()
    for _, __, x, y in candidates:
        if (x, y) in used:
            continue
        picks.append((x, y))
        used.add((x, y))
        if len(picks) >= count:
            break
    return picks

def _route_river(rng: KeyedRNG, dist: List[List[int]], src: Tuple[int,int]) -> List[Tuple[int,int]]:
    """Greedy descent along distance field until the tile is ocean-adjacent."""
    H = len(dist); W = len(dist[0]) if H else 0
    x, y = src
    if not (0 <= x < W and 0 <= y < H): return []
    if dist[y][x] <= 0: return []  # already ocean or invalid

    path: List[Tuple[int,int]] = [(x, y)]
    prev = None
    while True:
        d0 = dist[y][x]
        # stop when mouth is adjacent to ocean (neighbor with dist==0)
        if any(dist[ny][nx] == 0 for nx, ny in _neighbors4(x, y, W, H)):
            break
        # choose neighbor with strictly smaller dist; tie-break by RNG
        options = [(dist[ny][nx], nx, ny) for nx, ny in _neighbors4(x, y, W, H) if dist[ny][nx] >= 0 and dist[ny][nx] < d0]
        if not options:
            # dead-end (shouldn't happen with a valid distance field); bail
            break
        # Among minimal dist options, pick a deterministic one
        min_d = min(o[0] for o in options)
        min_list = [(nx, ny) for d, nx, ny in options if d == min_d]
        if len(min_list) > 1:
            idx = rng.randi(f"hyd.step.{x}.{y}", 0, len(min_list)-1)
            nx, ny = min_list[idx]
        else:
            nx, ny = min_list[0]

        if prev is not None and (nx, ny) == prev:
            break
        prev = (x, y)
        x, y = nx, ny
        path.append((x, y))
        # guard against runaway paths
        if len(path) > (W*H):
            break
    return path

def _grow_lake(rng: KeyedRNG, grid: List[List[str]], dist: List[List[int]], cx: int, cy: int, target_size: int) -> List[Tuple[int,int]]:
    """Grow a compact interior lake (~diamond growth). Never include ocean or border tiles."""
    H = len(grid); W = len(grid[0]) if H else 0
    if not (0 <= cx < W and 0 <= cy < H): return []
    if grid[cy][cx] == "ocean" or min(cx, cy, W-1-cx, H-1-cy) == 0:
        return []

    lake: Set[Tuple[int,int]] = set()
    frontier: List[Tuple[int,int]] = [(cx, cy)]
    while frontier and len(lake) < target_size:
        # Slight randomness to shape
        idx = rng.randi(f"hyd.lake.pick.{cx}.{cy}.{len(lake)}", 0, len(frontier)-1)
        x, y = frontier.pop(idx)
        if (x, y) in lake: continue
        if grid[y][x] == "ocean": continue
        if min(x, y, W-1-x, H-1-y) == 0:  # border
            continue
        lake.add((x, y))
        for nx, ny in _neighbors4(x, y, W, H):
            if (nx, ny) not in lake and grid[ny][nx] != "ocean":
                frontier.append((nx, ny))
    return list(lake)



# ======================================================================
# /plan — lightweight planner (no file writes)
# ======================================================================
def plan(
    *,
    req: PlanRequest,
    merged_tier: Dict[str, Any],
    tier_prov: str,
    biome_doc: LoadedDoc,
    seed: int,
    diff: OverrideDiff,
) -> PlanResponse:

    grid_cfg = merged_tier.get("grid", {})
    w, h = int(grid_cfg.get("cols", 16)), int(grid_cfg.get("rows", 16))
    tile_size = int(grid_cfg.get("tile_size", 16))

    water = merged_tier.get("water", {})
    ocean_ring = int(water.get("ocean_ring", 1))
    cw = water.get("coast_width", [1, 2])
    cmin, cmax = (int(cw[0]), int(cw[1])) if isinstance(cw, list) and len(cw) == 2 else (1, 2)

    rng = KeyedRNG(seed, namespace=f"v2.{req.templateId}")
    coast_w = rng.randi("water.coast_width", cmin, cmax)

    ocean_tiles = _ring_count(w, h, ocean_ring)
    coast_tiles = _coast_count(w, h, ocean_ring, coast_w)
    interior = w * h - ocean_tiles - coast_tiles

    hyd = merged_tier.get("hydrology", {})
    rmin = int(hyd.get("rivers", {}).get("min", 0))
    rmax = int(hyd.get("rivers", {}).get("max", 0))
    lake_chance = float(hyd.get("lake_chance", 0.0))
    lsz = hyd.get("lake_size", [2, 6])
    lmin, lmax = (int(lsz[0]), int(lsz[1])) if isinstance(lsz, list) and len(lsz) == 2 else (2, 6)

    rivers_chosen = rng.randi("hyd.river_count", rmin, rmax) if rmax >= rmin else 0
    lakes_chosen = 1 if (lake_chance > 0 and rng.randf("hyd.lake_roll") < lake_chance) else 0

    # interior bbox to pick preview coords from
    ix0 = _clamp(ocean_ring + coast_w, 0, w - 1)
    iy0 = _clamp(ocean_ring + coast_w, 0, h - 1)
    ix1 = _clamp(w - 1 - (ocean_ring + coast_w), 0, w - 1)
    iy1 = _clamp(h - 1 - (ocean_ring + coast_w), 0, h - 1)

    river_sources = [
        RiverSource(
            x=rng.randi(f"hyd.rsrc.x.{i}", ix0, ix1),
            y=rng.randi(f"hyd.rsrc.y.{i}", iy0, iy1),
            key=f"river.source.{i}",
        )
        for i in range(rivers_chosen)
    ]
    lake_seeds = [
        LakeSeed(
            x=rng.randi(f"hyd.lake.x.{i}", ix0, ix1),
            y=rng.randi(f"hyd.lake.y.{i}", iy0, iy1),
            size=rng.randi(f"hyd.lake.size.{i}", lmin, lmax),
            key=f"lake.seed.{i}",
        )
        for i in range(lakes_chosen)
    ]

    settlements_cfg = merged_tier.get("settlements", {})
    budget = settlements_cfg.get("budget", {})
    city_n = int(budget.get("city", 0))
    town_n = int(budget.get("town", 0))
    village_n = int(budget.get("village", 0))
    port_n = int(budget.get("port", 0))

    settlements_selected = {"city": [], "towns": [], "villages": [], "ports": []}
    for i in range(city_n):
        settlements_selected["city"].append(
            SettlementPick(
                x=rng.randi(f"sett.city.x.{i}", ix0, ix1),
                y=rng.randi(f"sett.city.y.{i}", iy0, iy1),
                score=round(0.75 + 0.2 * rng.randf(f"sett.city.sc.{i}"), 2),
                near=["river"],
            )
        )
    for i in range(town_n):
        settlements_selected["towns"].append(
            SettlementPick(
                x=rng.randi(f"sett.town.x.{i}", ix0, ix1),
                y=rng.randi(f"sett.town.y.{i}", iy0, iy1),
                score=round(0.6 + 0.2 * rng.randf(f"sett.town.sc.{i}"), 2),
            )
        )
    for i in range(village_n):
        settlements_selected["villages"].append(
            SettlementPick(
                x=rng.randi(f"sett.vil.x.{i}", ix0, ix1),
                y=rng.randi(f"sett.vil.y.{i}", iy0, iy1),
                score=round(0.5 + 0.2 * rng.randf(f"sett.vil.sc.{i}"), 2),
            )
        )
    # ports along the outer rim (ocean coast)
    for i in range(port_n):
        side = rng.choice(f"sett.port.side.{i}", ["N", "S", "E", "W"])
        if side in ("N", "S"):
            y = 0 if side == "N" else h - 1
            x = rng.randi(f"sett.port.x.{i}", 1, w - 2)
        else:
            x = 0 if side == "W" else w - 1
            y = rng.randi(f"sett.port.y.{i}", 1, h - 2)
        settlements_selected["ports"].append(
            SettlementPick(
                x=x,
                y=y,
                score=round(0.7 + 0.2 * rng.randf(f"sett.port.sc.{i}"), 2),
                type="ocean_coast",
                at_river_mouth=rng.coinflip(f"sett.port.mouth.{i}", 0.5),
            )
        )

    nodes = city_n + town_n + village_n + port_n
    edges = max(0, nodes - 1)
    bridges = {
        "candidates": max(0, rivers_chosen),
        "will_place": min(rivers_chosen, max(0, nodes // 3)),
        "max_span_rule": int(merged_tier.get("roads", {}).get("bridge", {}).get("max_span", 2)),
    }

    poi_cfg = merged_tier.get("poi", {})
    poi_budget = int(poi_cfg.get("budget", 0))
    poi_tables = poi_cfg.get("tables", [])

    selected_preview: List[POIPick] = []
    for i in range(poi_budget):
        selected_preview.append(
            POIPick(
                tag=("ruin_tower" if i % 2 == 0 else "fishing_hut"),
                x=rng.randi(f"poi.x.{i}", ix0, ix1),
                y=rng.randi(f"poi.y.{i}", iy0, iy1),
                why=["spacing_ok"],
            )
        )

    resources_cfg = merged_tier.get("resources", {})
    thresholds = resources_cfg.get("thresholds", {"ore": 0.8, "timber": 0.7, "herbs": 0.6, "fish": 0.7})
    potentials = resources_cfg.get("potentials", list(thresholds.keys()))
    coverage = {
        k: {"p10": 0.1, "p50": 0.5, "p90": 0.85, "high_tiles_est": max(0, int(interior * 0.12))}
        for k in potentials
    }

    layers = LayersBlock(
        water=WaterLayerPlan(
            ocean_ring=ocean_ring,
            coast_width=(cmin, cmax),
            coastline_ok=True,
            estimated_counts={
                "ocean_tiles": ocean_tiles,
                "coast_tiles": coast_tiles,
                "interior_land_tiles": interior,
                "interior_water_reserve": max(0, int(0.05 * interior)),
            },
        ),
        hydrology=HydrologyLayerPlan(
            requested=HydrologyRequested(
                rivers_min=rmin, rivers_max=rmax, lake_chance=lake_chance, lake_size=(lmin, lmax)
            ),
            chosen={"rivers": rivers_chosen, "lakes": lakes_chosen},
            river_sources=river_sources,
            lake_seeds=lake_seeds,
            notes=["rivers will greedily route to ocean using distance-to-ocean gradient"],
        ),
        biomes=BiomesLayerPlan(
            pack=biome_doc.id_at_version,
            assignment=BiomeAssignment(
                coast_biomes=[b["id"] if isinstance(b, dict) else b for b in merged_tier.get("biomes", {}).get("coast_biomes", [])],
                interior_weights=merged_tier.get("biomes", {}).get("interior_weights", {}),
            ),
            smoothing={"enabled": True, "min_patch_size": 3},
        ),
        settlements=SettlementsLayerPlan(
            candidates_scanned=max(10, interior // 4),
            selected=settlements_selected,
            constraints={"ports_ocean_only": True, "min_spacing_ok": True},
        ),
        roads=RoadsLayerPlan(strategy="mst", nodes=nodes, edges=edges, bridges=bridges),
        poi=POILayerPlan(
            budget=poi_budget,
            tables=poi_tables,
            min_spacing=int(poi_cfg.get("min_spacing", 3)),
            selected_preview=selected_preview,
            rejected_preview=[],
        ),
        resources=ResourcesLayerPlan(
            potentials=potentials,
            thresholds=thresholds,
            coverage_estimate=coverage,
            materialization_policy={
                "max_nodes_per_room": int(resources_cfg.get("max_nodes_per_room", 2)),
                "ambient_roll": bool(resources_cfg.get("ambient_roll", True)),
            },
        ),
    )

    budgets = BudgetsBlock(
        settlements={"city": city_n, "town": town_n, "village": village_n, "port": port_n},
        poi={"budget": poi_budget, "tables": poi_tables},
    )

    metrics = MetricsBlock(
        tile_counts_estimate=TileCountsEstimate(
            land=interior + coast_tiles,
            ocean=ocean_tiles,
            coast=coast_tiles,
            river_tiles=max(0, rivers_chosen * (h // 2)),
            lake_tiles=max(0, lakes_chosen * ((lmin + lmax) // 2)),
        ),
        connectivity=ConnectivityMetrics(road_components=1 if nodes > 0 else 0, river_outlets=max(1, rivers_chosen)),
    )

    filename = f"{seed:08d}_{req.name}.json"
    would_write = WouldWriteBlock(
        filename=filename,
        path=f"/static/public/shards/{filename}",
        compat=CompatBlock(
            includes_legacy_tiles=True,
            includes_grid_and_sites=True,
            extra_layers=["water", "hydrology", "roads", "poi", "resources"],
        ),
    )

    prov = Provenance(
        generator="v2",
        schema_version="2.0.0",
        template=tier_prov,
        biome_pack=biome_doc.id_at_version,
        seed=seed,
        # hash only the applied overrides for stable provenance
        overrides_hash=overrides_hash_sha1(diff.template_overrides_applied),
        request_echo={
            "templateId": req.templateId,
            "name": req.name,
            "autoSeed": req.autoSeed,
            "seed": seed,
        },
    )

    return PlanResponse(
        ok=True,
        plan_id=f"plan-{seed:08d}-{req.templateId}",
        timestamp=_iso_now(),
        provenance=prov,
        grid=GridSpec(cols=w, rows=h, tile_size=tile_size),
        diff=DiffBlock(
            template_overrides_applied=diff.template_overrides_applied,
            ignored_overrides=diff.ignored_overrides,
        ),
        budgets=budgets,
        layers=layers,
        metrics=metrics,
        warnings=[],
        would_write=would_write,
    )


# ======================================================================
# /generate — minimal shard write (ocean + coast + interior fill)
# ======================================================================
def generate(
    *,
    req: PlanRequest,
    merged_tier: Dict[str, Any],
    tier_prov: str,
    biome_doc: LoadedDoc,
    seed: int,
) -> Dict[str, Any]:

    grid_cfg = merged_tier.get("grid", {})
    w, h = int(grid_cfg.get("cols", 16)), int(grid_cfg.get("rows", 16))

    water = merged_tier.get("water", {})
    ocean_ring = int(water.get("ocean_ring", 1))
    cw = water.get("coast_width", [1, 2])
    cmin, cmax = (int(cw[0]), int(cw[1])) if isinstance(cw, list) and len(cw) == 2 else (1, 2)

    rng = KeyedRNG(seed, namespace=f"v2.{req.templateId}")
    coast_w = rng.randi("water.coast_width", cmin, cmax)

    # biome selection sources
    biome_cfg = biome_doc.data
    coast_entries = (merged_tier.get("biomes", {}) or {}).get("coast_biomes") \
                    or biome_cfg.get("coast_biomes", [])
    interior_weights = (merged_tier.get("biomes", {}) or {}).get("interior_weights") \
                    or biome_cfg.get("interior_weights", {"plains": 1.0})

    # build grid[y][x]
    grid: List[List[str]] = []
    for y in range(h):
        row: List[str] = []
        for x in range(w):
            d = min(x, y, w - 1 - x, h - 1 - y)
            if d < ocean_ring:
                cell = "ocean"
            elif d < ocean_ring + coast_w:
                cell = _pick_coast_biome(rng, f"coast.{x}.{y}", coast_entries)
            else:
                cell = _weighted_pick(rng, f"interior.{x}.{y}", interior_weights, fallback="plains")
            row.append(cell)
        grid.append(row)

    # minimal sites for first cut
    sites: List[Dict[str, Any]] = []

    layers: Dict[str, Any] = {
        "water": {
            "ocean_ring": ocean_ring,
            "coast_width": coast_w,
        }
    }

    provenance = {
        "generator": "v2",
        "schema_version": "2.0.0",
        "template": tier_prov,
        "biome_pack": biome_doc.id_at_version,
        "seed": seed,
    }

        # --- Hydrology v1: rivers + lakes (no elevation) ---
    dist = _compute_dist_to_ocean(grid)

    hyd_cfg = merged_tier.get("hydrology", {})
    r_cfg = hyd_cfg.get("rivers", {})
    rivers_min = int(r_cfg.get("min", 0))
    rivers_max = int(r_cfg.get("max", 0))
    rivers_n = rng.randi("hyd.count", rivers_min, rivers_max) if rivers_max >= rivers_min else 0

    lake_chance = float(hyd_cfg.get("lake_chance", 0.0))
    lsz = hyd_cfg.get("lake_size", [2, 6])
    lmin, lmax = (int(lsz[0]), int(lsz[1])) if isinstance(lsz, list) and len(lsz) == 2 else (2, 6)
    lakes_n = 1 if (lake_chance > 0.0 and rng.randf("hyd.lake.roll") < lake_chance) else 0

    # pick river sources from far interior
    sources = _pick_river_sources(rng.with_namespace("hyd"), dist, rivers_n, min_dist=3)

    # route rivers
    rivers: List[List[List[int]]] = []
    for i, (sx, sy) in enumerate(sources):
        path = _route_river(rng.with_namespace(f"river.{i}"), dist, (sx, sy))
        if len(path) >= 2:
            rivers.append([[x, y] for (x, y) in path])

    # build lakes
    lakes: List[Dict[str, Any]] = []
    for i in range(lakes_n):
        # choose a seed in interior with decent distance
        candidates = [(x, y) for y in range(h) for x in range(w) if dist[y][x] >= 3 and grid[y][x] != "ocean" and min(x,y,w-1-x,h-1-y)>0]
        if not candidates:
            break
        idx = rng.randi(f"lake.seed.pick.{i}", 0, len(candidates)-1)
        cx, cy = candidates[idx]
        size = rng.randi(f"lake.size.{i}", lmin, lmax)
        tiles = _grow_lake(rng.with_namespace(f"lake.{i}"), grid, dist, cx, cy, size)
        if tiles:
            lakes.append({"tiles": [[x, y] for (x, y) in tiles]})

    # Attach hydrology layer
    layers["hydrology"] = {
        "rivers": rivers,
        "lakes": lakes,
        "notes": ["distance-to-ocean routing; lakes are interior & non-ocean"],
    }


    # save
    res = save_shard_v2(
        base_name=req.name,
        seed=seed,
        grid=grid,
        sites=sites,
        layers=layers,
        width=w,
        height=h,
        display_name=req.name.replace("_", " ").title(),
        provenance=provenance,
        meta_extra={"template": req.templateId, "generator": "v2"},
    )

    meta = {
        "name": res.name[:-5],
        "displayName": req.name.replace("_", " ").title(),
        "seed": seed,
        "width": w,
        "height": h,
        "version": "2.0.0",
        "template": req.templateId,
        "generator": "v2",
    }
    return {"file": res.name, "path": res.url_path, "meta": meta}
