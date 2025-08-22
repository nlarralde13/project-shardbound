# /app/shardEngine/hydrology.py
from __future__ import annotations
from collections import deque
from typing import List, Tuple, Dict, Optional

# Expect a KeyedRNG with randi/randf/choice/with_namespace
Coord = Tuple[int, int]
Path  = List[Coord]

WATER_KEYS = {"ocean", "coast", "beach"}  # water / shoreline tags

def _dims(grid: List[List[str]]) -> Tuple[int,int]:
    h = len(grid) if grid else 0
    w = len(grid[0]) if h else 0
    return w, h

def _in_bounds(x:int,y:int,w:int,h:int)->bool:
    return 0 <= x < w and 0 <= y < h

def _is_water(tag: str) -> bool:
    return str(tag).lower() in WATER_KEYS

def _neighbors4(x:int,y:int)->List[Coord]:
    return [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]

def _distance_to_ocean(grid: List[List[str]]) -> List[List[int]]:
    """Multi-source BFS from ocean/coast/beach → integer distance field.
       0 for ocean/shore; big number for interior."""
    w,h = _dims(grid)
    INF  = 10**9
    dist = [[INF]*w for _ in range(h)]
    q = deque()
    for y in range(h):
        for x in range(w):
            if _is_water(grid[y][x]):
                dist[y][x] = 0
                q.append((x,y))
    while q:
        x,y = q.popleft()
        d = dist[y][x] + 1
        for nx,ny in _neighbors4(x,y):
            if _in_bounds(nx,ny,w,h) and d < dist[ny][nx]:
                dist[ny][nx] = d
                q.append((nx,ny))
    return dist

def _pick_sources(dist: List[List[int]], rng, k:int) -> List[Coord]:
    """Pick river sources in far-from-ocean tiles (top 20% of distance)."""
    h = len(dist); w = len(dist[0]) if h else 0
    vals = [dist[y][x] for y in range(h) for x in range(w) if dist[y][x] < 10**9]
    if not vals: return []
    cutoff = sorted(vals)[max(0, int(len(vals)*0.80))]
    candidates = [(x,y) for y in range(h) for x in range(w)
                  if dist[y][x] >= cutoff and dist[y][x] < 10**9]
    # deterministic shuffle using randf as key
    candidates.sort(key=lambda p: rng.randf(f"hyd.src.shuffle.{p[0]}.{p[1]}"))
    picked, used = [], set()
    for x,y in candidates:
        # keep sources spaced apart
        if all(abs(x-ux)+abs(y-uy) >= 4 for ux,uy in used):
            picked.append((x,y)); used.add((x,y))
            if len(picked) >= k: break
    return picked

def _route_to_coast(src: Coord, dist: List[List[int]], rng, occupied:set[Coord]) -> Path:
    """Greedy-descending path along decreasing distance values with light meander."""
    w = len(dist[0]); h = len(dist)
    path: Path = []
    x,y = src
    seen = set()
    LIMIT = w*h
    steps = 0
    while steps < LIMIT and _in_bounds(x,y,w,h):
        steps += 1
        path.append((x,y))
        seen.add((x,y))
        if dist[y][x] <= 0:  # reached shore/ocean
            break
        neigh = [(nx,ny) for nx,ny in _neighbors4(x,y) if _in_bounds(nx,ny,w,h)]
        better = [(nx,ny) for nx,ny in neigh if dist[ny][nx] < dist[y][x]]
        if not better:
            flat = [(nx,ny) for nx,ny in neigh if dist[ny][nx] == dist[y][x]]
            if not flat: break
            idx = rng.randi(f"hyd.flat.{x}.{y}.{steps}", 0, len(flat)-1)
            nx,ny = flat[idx]
        else:
            better.sort(key=lambda p: dist[p[1]][p[0]])
            top = better[: min(2, len(better))]
            idx = rng.randi(f"hyd.step.{x}.{y}.{steps}", 0, len(top)-1)
            nx,ny = top[idx]
        if (nx,ny) in seen or (nx,ny) in occupied:
            break
        x,y = nx,ny
    return path

def _find_local_maxima(dist: List[List[int]]) -> List[Coord]:
    w = len(dist[0]); h = len(dist)
    peaks: List[Coord] = []
    for y in range(h):
        for x in range(w):
            d = dist[y][x]
            if d <= 1 or d >= 10**9:
                continue
            best = max(dist[ny][nx] for nx,ny in _neighbors4(x,y)
                       if _in_bounds(nx,ny,w,h))
            if d >= best:
                peaks.append((x,y))
    return peaks

def _carve_lake(center: Coord, dist: List[List[int]], rng, max_tiles:int=8) -> List[Coord]:
    """Grow a compact blob around a peak; avoid touching ocean-edge."""
    w = len(dist[0]); h = len(dist)
    q = deque([center])
    tiles = set([center])
    while q and len(tiles) < max_tiles:
        x,y = q.popleft()
        for nx,ny in _neighbors4(x,y):
            if not _in_bounds(nx,ny,w,h): continue
            if dist[ny][nx] <= 1:  # don’t bleed into coast/ocean
                continue
            if (nx,ny) in tiles:   # already added
                continue
            # favor similar/high distances to keep lake inland
            bias = 1.0 if dist[ny][nx] >= dist[y][x]-1 else 0.35
            roll = rng.randf(f"hyd.lake.bias.{x}.{y}.{nx}.{ny}.{len(tiles)}")
            if roll < bias:
                tiles.add((nx,ny))
                q.append((nx,ny))
    return [(x,y) for x,y in tiles]

def generate_hydrology(
    grid: List[List[str]],
    rng,
    desired_rivers: Optional[int] = None,
    desired_lakes: Optional[int] = None,
) -> Dict[str, List]:
    """
    Returns:
      {
        "rivers": [ [(x,y), ...], ... ],
        "lakes":  [ [(x,y), ...], ... ]
      }
    """
    w,h = _dims(grid)
    if w == 0 or h == 0:
        return {"rivers": [], "lakes": []}

    dist = _distance_to_ocean(grid)

    land_tiles = sum(1 for y in range(h) for x in range(w)
                     if dist[y][x] < 10**9 and dist[y][x] > 0)

    # Heuristics scale with size; can be overridden
    rivers_n = desired_rivers if desired_rivers is not None else max(1, round(land_tiles / max(60, (w*h)//2)))
    lakes_n  = desired_lakes  if desired_lakes  is not None else max(0, round(land_tiles / max(200, (w*h))))

    # Rivers
    sources = _pick_sources(dist, rng.with_namespace("hyd.src"), rivers_n)
    occupied: set[Coord] = set()
    rivers: List[Path] = []
    for i, s in enumerate(sources):
        p = _route_to_coast(s, dist, rng.with_namespace(f"hyd.route.{i}"), occupied)
        if len(p) >= 3:
            rivers.append(p)
            occupied.update(p)

    # Lakes (near strong peaks; away from coast & rivers)
    peaks = _find_local_maxima(dist)
    peaks.sort(key=lambda c: rng.randf(f"hyd.lake.shuffle.{c[0]}.{c[1]}"))
    lakes: List[List[Coord]] = []
    for i, c in enumerate(peaks):
        if len(lakes) >= lakes_n: break
        size = rng.randi(f"hyd.lake.size.{i}", 4, 9)
        blob = _carve_lake(c, dist, rng.with_namespace(f"hyd.lake.{i}"), max_tiles=size)
        if not blob: continue
        if any((x,y) in occupied for (x,y) in blob):
            continue
        lakes.append(blob)

    return {"rivers": rivers, "lakes": lakes}
