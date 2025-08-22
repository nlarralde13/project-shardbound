# /app/shardEngine/generator_v2.py
from __future__ import annotations

from typing import Any, Dict, List, Tuple, Optional
import math

from .schemas import PlanRequest
from .registry import overrides_hash_sha1
from .rng import KeyedRNG
from .persistence import save_shard_v2
from .hydrology import generate_hydrology

Coord = Tuple[int, int]

# ---------- utils ----------

def _dims(grid: List[List[str]]) -> Tuple[int, int]:
    h = len(grid) if grid else 0
    w = len(grid[0]) if h else 0
    return w, h

def _inb(x: int, y: int, w: int, h: int) -> bool:
    return 0 <= x < w and 0 <= y < h

def _n4(x: int, y: int) -> List[Coord]:
    return [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

def _n8(x: int, y: int) -> List[Coord]:
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            out.append((x + dx, y + dy))
    return out

def _manhattan(a: Coord, b: Coord) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

def _choose_coast_biome(rng: KeyedRNG, key: str, coast_entries: List[Any]) -> str:
    items: List[Tuple[str, float]] = []
    total = 0.0
    for e in coast_entries or []:
        if isinstance(e, dict):
            bi = e.get("id", "coast")
            wt = float(e.get("weight", 1.0))
        else:
            bi, wt = str(e), 1.0
        wt = max(0.0, wt)
        items.append((bi, wt))
        total += wt
    if total <= 0.0:
        return "coast"
    r = rng.randf(key) * total
    acc = 0.0
    for bi, wt in items:
        acc += wt
        if r <= acc:
            return bi
    return "coast"

def _weighted_pick(rng: KeyedRNG, key: str, weights: Dict[str, float], fallback: str) -> str:
    total = 0.0
    items: List[Tuple[str, float]] = []
    for k, v in (weights or {}).items():
        w = float(v)
        if w > 0:
            items.append((k, w))
            total += w
    if total <= 0:
        return fallback
    r = rng.randf(key) * total
    acc = 0.0
    for k, w in items:
        acc += w
        if r <= acc:
            return k
    return fallback

# ---------- tiny deterministic value-noise + fBm (no external deps) ----------

def _fade(t: float) -> float:
    # smootherstep (Perlin)
    return t * t * t * (t * (t * 6 - 15) + 10)

def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t

def _lattice(rng: KeyedRNG, ns: str, ix: int, iy: int) -> float:
    # deterministic 0..1 per integer lattice point
    return rng.randf(f"{ns}.{ix}.{iy}")

def _value_noise(rng: KeyedRNG, ns: str, x: float, y: float) -> float:
    # bilinear interpolation of lattice values
    ix = math.floor(x); iy = math.floor(y)
    fx = x - ix;        fy = y - iy
    v00 = _lattice(rng, ns, ix,   iy)
    v10 = _lattice(rng, ns, ix+1, iy)
    v01 = _lattice(rng, ns, ix,   iy+1)
    v11 = _lattice(rng, ns, ix+1, iy+1)
    ux = _fade(fx); uy = _fade(fy)
    a = _lerp(v00, v10, ux)
    b = _lerp(v01, v11, ux)
    return _lerp(a, b, uy)  # 0..1

def _fbm(rng: KeyedRNG, base_ns: str, x: float, y: float, octaves: int, lacunarity: float, gain: float) -> float:
    """Returns approximately in [-1, 1]."""
    amp = 0.5
    freq = 1.0
    total = 0.0
    for o in range(max(1, octaves)):
        n = _value_noise(rng, f"{base_ns}.{o}", x * freq, y * freq) * 2.0 - 1.0  # -1..1
        total += n * amp
        freq *= lacunarity
        amp *= gain
    return max(-1.0, min(1.0, total))

# ---------- PLAN ----------

def plan(
    *,
    req,
    merged_tier: Dict[str, Any],
    tier_prov: str,
    biome_doc: Any,
    seed: int,
    diff: Optional[Dict[str, Any]] = None,
    **_ignored,
) -> Dict[str, Any]:
    width  = int(merged_tier.get("grid", {}).get("width", 16))
    height = int(merged_tier.get("grid", {}).get("height", width))

    would_name = f"{seed:08d}_{req.name}.json"
    would_path = f"/static/public/shards/{would_name}"

    metrics = {
        "tileCounts_hint": {"ocean_border_est": width * 4 + height * 4},
        "connectivity": {"coastRing": True},
    }

    return {
        "ok": True,
        "planId": f"plan-{seed}-{req.templateId}",
        "seed": seed,
        "grid": {"width": width, "height": height},
        "provenance": {
            "generator": "v2",
            "schema_version": "2.0.0",
            "template": tier_prov,
            "biome_pack": getattr(biome_doc, "id_at_version", str(biome_doc)),
            "seed": seed,
        },
        "layers": {
            "water": {"coast_width": merged_tier.get("water", {}).get("coast_width", [1, 2])},
            "hydrology": {"requested": True},
            "settlements": {"requested": True},
            "roads": {"requested": True},
            "elevation": {"provided": True},
        },
        "wouldWrite": {"name": would_name, "path": would_path},
        "compat": {"v1_like_sites": True},
        "metrics": metrics,
    }

# ---------- GENERATE ----------

def generate(
    *,
    req,
    merged_tier: Dict[str, Any],
    tier_prov: str,
    biome_doc: Any,
    seed: int,
    diff: Optional[Dict[str, Any]] = None,
    **_ignored,
) -> Dict[str, Any]:
    rng = KeyedRNG(seed)

    # --- grid size
    w = int(merged_tier.get("grid", {}).get("width", 16))
    h = int(merged_tier.get("grid", {}).get("height", w))

    # --- world / noise settings
    world_cfg = (merged_tier.get("world") or {})
    world_type = str(world_cfg.get("type", "mixed")).lower()  # 'continent' | 'archipelago' | 'mixed'
    land_target = float(world_cfg.get("landmass_ratio", merged_tier.get("landmass_ratio", 0.44)))
    land_target = max(0.05, min(0.9, land_target))

    noise_cfg = (merged_tier.get("noise") or {})
    octaves    = int(noise_cfg.get("octaves", 4))
    base_freq  = float(noise_cfg.get("frequency", 1.3))   # “how many main blobs across map”
    lacunarity = float(noise_cfg.get("lacunarity", 2.0))
    gain       = float(noise_cfg.get("gain", 0.5))
    smooth_it  = int(noise_cfg.get("smooth_iters", 1))

    # --- coast width
    water_cfg = merged_tier.get("water", {}) or {}
    cw_raw = water_cfg.get("coast_width", [1, 2])
    if isinstance(cw_raw, list) and len(cw_raw) >= 2:
        coast_w = rng.randi("water.coastw", int(cw_raw[0]), int(cw_raw[1]))
    else:
        coast_w = int(cw_raw if isinstance(cw_raw, int) else 1)
    coast_w = max(1, min(3, coast_w))

    # --- heightmap (fBm + world mask)
    # coordinate space: make noise frequency independent of absolute pixels
    # so base_freq ≈ number of “main features” across the map.
    def sample_height(xx: int, yy: int) -> float:
        # normalize to 0..1
        nx, ny = xx / max(1.0, w), yy / max(1.0, h)

        # world shape mask
        cx, cy = nx - 0.5, ny - 0.5
        r = math.sqrt(cx*cx + cy*cy) * 1.4142  # 0..~1 to corners
        if world_type == "continent":
            mask = 1.0 - (r ** 1.5)  # landier center, oceanic edges
        elif world_type == "archipelago":
            mask = 0.85  # mostly neutral; islands come from higher-frequency noise
        else:  # mixed
            mask = 0.9 - (r ** 1.2) * 0.4

        # base fBm
        v_lo = _fbm(rng, "hm.lo", nx * base_freq,  ny * base_freq,  octaves, lacunarity, gain)
        # a little extra detail
        v_hi = _fbm(rng, "hm.hi", nx * base_freq*2.2, ny * base_freq*2.2,  octaves-1, lacunarity, gain)

        h_raw = 0.65 * v_lo + 0.35 * v_hi  # -1..1
        h_masked = h_raw * mask
        return h_masked  # still roughly -1..1

    elev = [[0.0 for _ in range(w)] for _ in range(h)]
    lo, hi = +1e9, -1e9
    for y in range(h):
        for x in range(w):
            v = sample_height(x, y)
            elev[y][x] = v
            lo = min(lo, v); hi = max(hi, v)

    # normalize to 0..1 for thresholding
    span = max(1e-6, hi - lo)
    for y in range(h):
        for x in range(w):
            elev[y][x] = (elev[y][x] - lo) / span  # 0..1

    # optional smoothing to remove single-tile noise
    for _ in range(max(0, smooth_it)):
        new = [[elev[y][x] for x in range(w)] for y in range(h)]
        for y in range(h):
            for x in range(w):
                s = elev[y][x]
                cnt = 1
                for nx, ny in _n8(x, y):
                    if _inb(nx, ny, w, h):
                        s += elev[ny][nx]
                        cnt += 1
                new[y][x] = s / cnt
        elev = new

    # choose sea level by binary search to hit target land ratio
    def land_ratio_at(thr: float) -> float:
        land = 0
        for y in range(h):
            for x in range(w):
                if elev[y][x] >= thr:
                    land += 1
        return land / (w * h)

    lo_thr, hi_thr = 0.20, 0.80
    for _ in range(18):
        mid = (lo_thr + hi_thr) * 0.5
        r = land_ratio_at(mid)
        if r > land_target:
            lo_thr = mid
        else:
            hi_thr = mid
    sea_level = (lo_thr + hi_thr) * 0.5

    # paint biomes: start ocean/land, then coasts
    grid: List[List[str]] = [["ocean" for _ in range(w)] for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if elev[y][x] >= sea_level:
                grid[y][x] = "plains"

    # coast ring wherever land touches ocean
    coast_entries = (getattr(biome_doc, "data", {}) or {}).get("coast", [])
    for y in range(h):
        for x in range(w):
            if grid[y][x] != "ocean":
                # within coast_w of ocean?
                make_coast = False
                for ring in range(1, coast_w + 1):
                    x0, x1 = x - ring, x + ring
                    y0, y1 = y - ring, y + ring
                    for nx in range(x0, x1 + 1):
                        if _inb(nx, y0, w, h) and grid[y0][nx] == "ocean":
                            make_coast = True; break
                        if _inb(nx, y1, w, h) and grid[y1][nx] == "ocean":
                            make_coast = True; break
                    if make_coast:
                        break
                    for ny in range(y0, y1 + 1):
                        if _inb(x0, ny, w, h) and grid[ny][x0] == "ocean":
                            make_coast = True; break
                        if _inb(x1, ny, w, h) and grid[ny][x1] == "ocean":
                            make_coast = True; break
                    if make_coast:
                        break
                if make_coast:
                    grid[y][x] = _choose_coast_biome(rng, f"coast.{x}.{y}", coast_entries)

    # interior variety by elevation + jitter
    # thresholds relative to land heights within [sea_level..1]
    def land_norm(v: float) -> float:
        return 0.0 if v < sea_level else (v - sea_level) / max(1e-6, 1.0 - sea_level)

    for y in range(h):
        for x in range(w):
            b = grid[y][x]
            if b == "plains":
                z = land_norm(elev[y][x])  # 0 lowland .. 1 high
                j = (rng.randf(f"bio.jit.{x}.{y}") - 0.5) * 0.10
                z2 = max(0.0, min(1.0, z + j))
                if z2 > 0.80:
                    grid[y][x] = "mountains"
                elif z2 > 0.55:
                    grid[y][x] = "hills"
                else:
                    # sprinkle forests & marsh-lite in lowlands
                    if rng.randf(f"forest.jit.{x}.{y}") < 0.28:
                        grid[y][x] = "forest"
                    elif rng.randf(f"marsh.jit.{x}.{y}") < 0.05:
                        grid[y][x] = "marsh-lite"

    # ---------- hydrology ----------
    land_tiles = sum(1 for y in range(h) for x in range(w) if grid[y][x] != "ocean" and "coast" not in grid[y][x])
    area_scale = math.sqrt(max(1, land_tiles))
    hydro_cfg = (merged_tier.get("hydrology") or {})
    desired_rivers = int(hydro_cfg.get("desired_rivers", 0)) or max(1, int(area_scale / 6))
    desired_lakes  = int(hydro_cfg.get("desired_lakes", 0))  or max(0, int(area_scale / 10))

    hydro = generate_hydrology(
        grid=grid,
        rng=rng.with_namespace("hydrology"),
        desired_rivers=desired_rivers,
        desired_lakes=desired_lakes,
    )
    rivers = [[[x, y] for (x, y) in path] for path in hydro.get("rivers", [])]
    lakes  = [{"tiles": [[x, y] for (x, y) in blob]} for blob in hydro.get("lakes", [])]
    river_tiles = {(x, y) for path in rivers for (x, y) in path}

    # ---------- ports (coast land, favor coves & river mouths) ----------
    def is_ocean(x: int, y: int) -> bool:
        return _inb(x, y, w, h) and grid[y][x] == "ocean"

    def is_coast_land(x: int, y: int) -> bool:
        if not _inb(x, y, w, h):
            return False
        if grid[y][x] == "ocean":
            return False
        return any(is_ocean(nx, ny) for nx, ny in _n4(x, y))

    mouth_adjacency = set()
    for path in rivers:
        if not path:
            continue
        mx, my = path[-1]
        mouth_adjacency.add((mx, my))
        for nx, ny in _n4(mx, my):
            if _inb(nx, ny, w, h):
                mouth_adjacency.add((nx, ny))

    port_budget = int(((merged_tier.get("settlements", {}) or {}).get("budget", {}) or {}).get("port", 0))
    port_candidates: List[Tuple[float, int, int, bool]] = []
    for y in range(h):
        for x in range(w):
            if not is_coast_land(x, y):
                continue
            o4 = sum(1 for nx, ny in _n4(x, y) if is_ocean(nx, ny))
            if o4 == 0:
                continue
            o8 = sum(1 for nx, ny in _n8(x, y) if is_ocean(nx, ny))
            cove_bonus = 0.75 if o4 == 1 else (0.25 if o4 == 2 else -0.4)
            at_mouth = (x, y) in mouth_adjacency
            river_bonus = 0.6 if at_mouth else 0.0
            score = (o8 * 0.2) + cove_bonus + river_bonus
            score += (rng.randf(f"ports.jit.{x}.{y}") - 0.5) * 0.05
            port_candidates.append((score, x, y, at_mouth))

    port_candidates.sort(key=lambda t: t[0], reverse=True)
    ports: List[Tuple[int, int, bool]] = []
    for score, x, y, at_mouth in port_candidates:
        if len(ports) >= port_budget:
            break
        if any(_manhattan((x, y), (px, py)) < 4 for (px, py, _) in ports):
            continue
        ports.append((x, y, at_mouth))

    # ---------- settlements ----------
    settle_cfg = (merged_tier.get("settlements", {}) or {})
    budget = (settle_cfg.get("budget", {}) or {})
    n_city    = int(budget.get("city", 0))
    n_town    = int(budget.get("town", 0))
    n_village = int(budget.get("village", 0))

    suit = {"plains": 1.0, "forest": 0.75, "hills": 0.65, "marsh-lite": 0.35, "desert": 0.2, "tundra": 0.2}

    def near_river_bonus(x: int, y: int) -> float:
        for nx, ny in _n4(x, y):
            if (nx, ny) in river_tiles:
                return 0.5
        return 0.0

    def near_coast_bonus(x: int, y: int) -> float:
        for nx, ny in _n4(x, y):
            if is_ocean(nx, ny):
                return 0.4
        return 0.0

    cand: List[Tuple[float, int, int, str]] = []
    for y in range(h):
        for x in range(w):
            b = grid[y][x]
            if b == "ocean" or "coast" in b:
                continue
            s = suit.get(b, 0.6) + near_river_bonus(x, y) + near_coast_bonus(x, y)
            s += (rng.randf(f"settle.jit.{x}.{y}") - 0.5) * 0.05
            cand.append((s, x, y, b))
    cand.sort(key=lambda t: t[0], reverse=True)

    def pick_n(n: int, min_dist: int) -> List[Tuple[int, int]]:
        picks: List[Tuple[int, int]] = []
        for score, x, y, _ in cand:
            if len(picks) >= n:
                break
            if any(_manhattan((x, y), p) < min_dist for p in picks):
                continue
            if is_coast_land(x, y):  # keep core settlements off exact shoreline
                continue
            picks.append((x, y))
        return picks

    cities    = pick_n(n_city,    min_dist=6)
    towns     = pick_n(n_town,    min_dist=5)
    villages  = pick_n(n_village, min_dist=4)

    # ---------- roads & bridges (A* + MST backbone) ----------
    from heapq import heappush, heappop

    def walkable(x: int, y: int) -> bool:
        return _inb(x, y, w, h) and grid[y][x] != "ocean"

    def astar(start: Coord, goal: Coord) -> List[Coord]:
        if start == goal:
            return [start]
        openh: List[Tuple[int, int, Coord]] = []
        heappush(openh, (0, 0, start))
        came: Dict[Coord, Optional[Coord]] = {start: None}
        gscore: Dict[Coord, int] = {start: 0}
        it = 0
        while openh and it < w * h * 10:
            it += 1
            _, _, cur = heappop(openh)
            if cur == goal:
                break
            cx, cy = cur
            for nx, ny in _n4(cx, cy):
                if not walkable(nx, ny):
                    continue
                step = 1
                if (nx, ny) in river_tiles:
                    step += 2  # prefer bridges only when useful
                newg = gscore[cur] + step
                if newg < gscore.get((nx, ny), 1_000_000_000):
                    gscore[(nx, ny)] = newg
                    came[(nx, ny)] = cur
                    f = newg + abs(nx - goal[0]) + abs(ny - goal[1])
                    heappush(openh, (f, it, (nx, ny)))
        if goal not in came:
            return []
        path: List[Coord] = []
        cur: Optional[Coord] = goal
        while cur is not None:
            path.append(cur)
            cur = came[cur]
        path.reverse()
        return path

    all_nodes: List[Coord] = []
    all_nodes.extend(cities); all_nodes.extend(towns); all_nodes.extend(villages)
    all_nodes.extend([(x, y) for x, y, _ in ports])

    edges: List[Tuple[Coord, Coord]] = []
    if len(all_nodes) >= 2:
        used = {all_nodes[0]}
        left = set(all_nodes[1:])
        while left:
            best = None; bestd = 10**9
            for a in list(used):
                for b in list(left):
                    d = _manhattan(a, b)
                    if d < bestd:
                        bestd = d; best = (a, b)
            edges.append(best)           # type: ignore
            used.add(best[1])            # type: ignore
            left.remove(best[1])         # type: ignore

    if ports:
        land_nodes = cities + towns + villages
        for px, py, _ in ports:
            if not land_nodes:
                break
            nearest = min(land_nodes, key=lambda q: _manhattan((px, py), q))
            if ((px, py), nearest) not in edges and (nearest, (px, py)) not in edges:
                edges.append(((px, py), nearest))

    roads: List[List[List[int]]] = []
    bridges: List[Dict[str, Any]] = []
    for a, b in edges:
        path = astar(a, b)
        if len(path) >= 2:
            for i in range(1, len(path) - 1):
                x, y = path[i]
                if (x, y) in river_tiles:
                    bridges.append({"x": x, "y": y})
            roads.append([[x, y] for (x, y) in path])

    # ---------- sites & layers ----------
    sites: List[Dict[str, Any]] = []
    for x, y in cities:    sites.append({"type": "city",    "x": x, "y": y})
    for x, y in towns:     sites.append({"type": "town",    "x": x, "y": y})
    for x, y in villages:  sites.append({"type": "village", "x": x, "y": y})
    for x, y, at_mouth in ports:
        tags = ["ocean_coast"]
        if bool(at_mouth):
            tags.append("river_mouth")
        sites.append({"type": "port", "x": x, "y": y, "tags": tags})

    # pack elevation as a small integer grid for tooltips
    # scale to 0..100 (sea_level noted)
    elev_scaled = [[int(round(v * 100.0)) for v in row] for row in elev]
    layers: Dict[str, Any] = {
        "water": {"coast_width": coast_w},
        "hydrology": {"rivers": rivers, "lakes": lakes},
        "settlements": {
            "cities":   [{"x": x, "y": y} for x, y in cities],
            "towns":    [{"x": x, "y": y} for x, y in towns],
            "villages": [{"x": x, "y": y} for x, y in villages],
            "ports":    [{"x": x, "y": y, "at_river_mouth": bool(at)} for x, y, at in ports],
        },
        "roads": {"paths": roads, "bridges": bridges},
        "elevation": elev_scaled,
        "world": {
            "type": world_type,
            "landmass_ratio": land_target,
            "sea_level": round(sea_level, 3),
            "noise": {"octaves": octaves, "frequency": base_freq, "lacunarity": lacunarity, "gain": gain, "smooth_iters": smooth_it},
        },
    }

    provenance = {
        "generator": "v2",
        "schema_version": "2.0.0",
        "template": tier_prov,
        "biome_pack": getattr(biome_doc, "id_at_version", str(biome_doc)),
        "seed": seed,
    }

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
