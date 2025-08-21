# test_api.py
# Minimal dependency: pip install requests

import os, sys, json, uuid
from typing import Dict, Any, List, Tuple, Optional, Set
import requests
from collections import deque

BASE = os.environ.get("BASE_URL", "http://localhost:5000")
V2_PREFIX = f"{BASE}/api/shard-gen-v2"
TIMEOUT = 20

DEFAULT_BODY: Dict[str, Any] = {
    "templateId": os.environ.get("TEMPLATE_ID", "normal-16"),
    "name": os.environ.get("SHARD_NAME", f"smoke_{uuid.uuid4().hex[:6]}"),
    "autoSeed": True,
    "overrides": {
        "poi": {"budget": int(os.environ.get("POI_BUDGET", "3"))}
    }
}

REQUIRED_LAYERS: Set[str] = set(
    [s.strip() for s in os.environ.get("REQUIRED_LAYERS", "").split(",") if s.strip()]
)

# ---------------- utils ----------------

def ok(status: int) -> bool:
    return 200 <= status < 300

def jdump(obj) -> str:
    try:
        return json.dumps(obj, indent=2)
    except Exception:
        return str(obj)

def get_json(resp: requests.Response):
    try:
        return resp.json()
    except Exception:
        return {"_raw": resp.text}

# ---------------- core requests ----------------

def get_catalog() -> bool:
    url = f"{BASE}/api/catalog"
    print(f"[GET] {url}")
    r = requests.get(url, timeout=TIMEOUT)
    print(f"  -> {r.status_code}")
    if not ok(r.status_code):
        print(jdump(get_json(r)))
        return False
    return True

def post_plan(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    url = f"{V2_PREFIX}/plan"
    print(f"[POST] {url}")
    r = requests.post(url, json=body, timeout=TIMEOUT)
    print(f"  -> {r.status_code}")
    data = get_json(r)
    if not ok(r.status_code) or not data.get("ok"):
        print(jdump(data))
        return None
    print(f"  plan_id: {data.get('plan_id')}  seed: {data.get('provenance', {}).get('seed')}")
    return data

def post_generate(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    url = f"{V2_PREFIX}/generate"
    print(f"[POST] {url}")
    r = requests.post(url, json=body, timeout=TIMEOUT)
    print(f"  -> {r.status_code}")
    data = get_json(r)
    if not ok(r.status_code) or not data.get("ok"):
        print(jdump(data))
        return None
    print(f"  file: {data['file']}  path: {data['path']}")
    return data

def get_file_json(path: str) -> Optional[Dict[str, Any]]:
    url = f"{BASE}{path}"
    print(f"[GET] {url}")
    r = requests.get(url, timeout=TIMEOUT)
    print(f"  -> {r.status_code}")
    if not ok(r.status_code):
        print(r.text[:300])
        return None
    try:
        return r.json()
    except Exception:
        print("  !! fetched file is not JSON")
        return None

# ---------------- helpers: grid & geometry ----------------

def dims(grid: List[List[str]]) -> Tuple[int,int]:
    h = len(grid); w = len(grid[0]) if h else 0
    return w, h

def ring_distance(x:int, y:int, w:int, h:int) -> int:
    """Min distance to outer border (0 on border)."""
    return min(x, y, w-1-x, h-1-y)

def assert_true(cond: bool, msg: str, errs: List[str]):
    if not cond:
        errs.append(msg)

def coast_set_from_plan(plan: Dict[str, Any]) -> Set[str]:
    entries = (plan.get("layers", {})
                    .get("biomes", {})
                    .get("assignment", {})
                    .get("coast_biomes") or [])
    out: Set[str] = set()
    for e in entries:
        if isinstance(e, str):
            out.add(e)
        elif isinstance(e, dict):
            out.add(e.get("id", "coast"))
    if not out:
        out = {"coast", "beach", "marsh-lite"}
    return out

# ---------------- hydrology helpers & validator ----------------

def compute_dist_to_ocean(grid: List[List[str]]) -> List[List[int]]:
    """Multi-source BFS distance (4-neigh) from ocean tiles. -1 = unreachable."""
    H = len(grid); W = len(grid[0]) if H else 0
    dist = [[-1]*W for _ in range(H)]
    q = deque()
    for y in range(H):
        for x in range(W):
            if grid[y][x] == "ocean":
                dist[y][x] = 0
                q.append((x, y))
    DIRS = [(1,0),(-1,0),(0,1),(0,-1)]
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS:
            nx, ny = x+dx, y+dy
            if 0 <= nx < W and 0 <= ny < H and dist[ny][nx] == -1:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    return dist

def validate_hydrology(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []
    layers = shard.get("layers", {})
    hydro = layers.get("hydrology")
    if not isinstance(hydro, dict):
        return errs  # nothing to validate yet

    rivers = hydro.get("rivers")  # expected: list of lists of [x,y] in flow order
    lakes = hydro.get("lakes")    # expected: list of {"tiles":[[x,y],...]} or list of [[x,y],...]

    grid = shard.get("grid", [])
    if not grid:
        return errs

    W, H = len(grid[0]), len(grid)
    dist = compute_dist_to_ocean(grid)

    # Rivers strictly descend toward ocean; mouth adjacent to ocean
    if isinstance(rivers, list):
        for idx, path in enumerate(rivers):
            if not isinstance(path, list) or len(path) < 2:
                errs.append(f"river[{idx}] too short or wrong type")
                continue
            last_d = None
            bad = False
            for (x, y) in path:
                if not (0 <= x < W and 0 <= y < H):
                    errs.append(f"river[{idx}] out of bounds at ({x},{y})")
                    bad = True; break
                d = dist[y][x]
                if d < 0:
                    errs.append(f"river[{idx}] passes unreachable tile ({x},{y})")
                    bad = True; break
                if last_d is not None and d >= last_d:
                    errs.append(f"river[{idx}] not descending at ({x},{y}) d={d} >= prev={last_d}")
                    bad = True; break
                last_d = d
            if not bad:
                x, y = path[-1]
                if not any(0 <= x+dx < W and 0 <= y+dy < H and grid[y+dy][x+dx] == "ocean"
                           for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]):
                    errs.append(f"river[{idx}] mouth not adjacent to ocean at ({x},{y})")

    # Lakes: interior only, never ocean tiles
    def iter_lake_tiles(l):
        if isinstance(l, dict) and "tiles" in l: return l["tiles"]
        return l

    if isinstance(lakes, list):
        for li, lake in enumerate(lakes):
            tiles = iter_lake_tiles(lake) or []
            for (x, y) in tiles:
                if not (0 <= x < W and 0 <= y < H): continue
                if grid[y][x] == "ocean":
                    errs.append(f"lake[{li}] includes ocean tile at ({x},{y})")
                if ring_distance(x, y, W, H) == 0:
                    errs.append(f"lake[{li}] touches map border at ({x},{y})")
    return errs

# ---------------- other optional validators ----------------

def validate_poi_spacing(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []
    poi_layer = shard.get("layers", {}).get("poi")
    if not isinstance(poi_layer, dict):
        return errs

    # adapt this filter to your final site schema
    sites = shard.get("sites", [])
    pois = [
        s for s in sites
        if (s.get("type") or s.get("tag") or "").lower().startswith(
            ("poi", "ruin", "watch", "fishing", "lighthouse")
        )
    ]
    if len(pois) <= 1:
        return errs

    ms = int(plan.get("layers", {}).get("poi", {}).get("min_spacing", 0) or 0)
    if ms <= 0:
        return errs

    def manhattan(a,b): return abs(a[0]-b[0]) + abs(a[1]-b[1])
    def pos(s):
        if "x" in s and "y" in s: return (int(s["x"]), int(s["y"]))
        p = s.get("pos", [0,0]); return (int(p[0]), int(p[1]))

    for i in range(len(pois)):
        for j in range(i+1, len(pois)):
            if manhattan(pos(pois[i]), pos(pois[j])) < ms:
                errs.append(f"POIs too close: idx {i} and {j} (< {ms})")
    return errs

def validate_ports_on_ocean(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []
    sites = shard.get("sites", [])
    ports = [s for s in sites if (s.get("type") or "").lower() == "port"]
    if not ports:
        return errs

    grid = shard.get("grid", [])
    if not grid:
        return errs
    W, H = len(grid[0]), len(grid)

    coast_set = coast_set_from_plan(plan)
    for p in ports:
        x, y = int(p.get("x", 0)), int(p.get("y", 0))
        if not (0 <= x < W and 0 <= y < H):
            errs.append(f"port out of bounds at ({x},{y})"); continue
        cell = grid[y][x]
        border = ring_distance(x,y,W,H) == 0
        ocean_adj = any(0 <= x+dx < W and 0 <= y+dy < H and grid[y+dy][x+dx] == "ocean"
                        for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
        if not (border or (cell in coast_set and ocean_adj)):
            errs.append(f"port not on ocean coast at ({x},{y}); cell={cell}, border={border}, ocean_adj={ocean_adj}")
    return errs

def validate_roads_bridges(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []
    roads = shard.get("layers", {}).get("roads")
    if not isinstance(roads, dict):
        return errs

    edges = roads.get("edges"); nodes = roads.get("nodes")
    if isinstance(edges, int) and isinstance(nodes, int):
        if edges > max(0, nodes - 1):
            errs.append(f"roads.edges ({edges}) > nodes-1 ({nodes-1})")

    bridges = roads.get("bridges")
    if isinstance(bridges, dict):
        max_span = int(bridges.get("max_span_rule", 3))
        spans = bridges.get("spans")
        if isinstance(spans, list):
            for bi, tiles in enumerate(spans):
                if isinstance(tiles, list) and len(tiles) > max_span:
                    errs.append(f"bridge[{bi}] span {len(tiles)} > max_span {max_span}")
    return errs

# ---------------- core validations ----------------

def validate_v2_basics(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []

    # presence
    for k in ("meta","grid","sites","layers","provenance"):
        assert_true(k in shard, f"missing '{k}' in generated shard", errs)

    # dims match meta
    grid = shard.get("grid", [])
    W,H = dims(grid)
    meta = shard.get("meta", {})
    assert_true(W == int(meta.get("width", -1)) and H == int(meta.get("height", -1)),
                f"grid dims {W}x{H} != meta {meta.get('width')}x{meta.get('height')}", errs)

    # required layers (optional via env)
    if REQUIRED_LAYERS:
        present = set(shard.get("layers", {}).keys())
        missing = REQUIRED_LAYERS - present
        for lay in sorted(missing):
            errs.append(f"required layer missing: layers.{lay}")

    # water invariants
    water_layer = shard.get("layers", {}).get("water", {})
    ocean_ring = int(water_layer.get("ocean_ring", 1))
    chosen_coast_w = int(water_layer.get("coast_width", 1))
    coast_set = coast_set_from_plan(plan)

    # 1) border must be ocean
    for y in range(H):
        for x in range(W):
            if ring_distance(x,y,W,H) < ocean_ring:
                assert_true(grid[y][x] == "ocean", f"non-ocean at border ({x},{y})={grid[y][x]}", errs)

    # 2) coast belt must be coast biome
    for y in range(H):
        for x in range(W):
            d = ring_distance(x,y,W,H)
            if ocean_ring <= d < (ocean_ring + chosen_coast_w):
                if grid[y][x] not in coast_set:
                    errs.append(f"non-coast in coast belt ({x},{y})={grid[y][x]}")

    # 3) no ocean inside interior (beyond ocean+coast)
    for y in range(H):
        for x in range(W):
            d = ring_distance(x,y,W,H)
            if d >= (ocean_ring + chosen_coast_w):
                if grid[y][x] == "ocean":
                    errs.append(f"ocean found in interior ({x},{y})")

    return errs

def validate_optional_layers(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []
    errs += validate_hydrology(plan, shard)
    errs += validate_poi_spacing(plan, shard)
    errs += validate_ports_on_ocean(plan, shard)
    errs += validate_roads_bridges(plan, shard)
    return errs

# ---------------- runner ----------------

def run(which: str) -> bool:
    print("=== ShardBound API smoke ===")
    print(f"BASE={BASE}")
    print(f"POST body={jdump(DEFAULT_BODY)}\n")

    passed = True
    if which in ("all","catalog"):
        passed &= get_catalog()

    # Always plan first (even if only generating) for determinism & coast biomes
    plan_data = post_plan(DEFAULT_BODY)
    if plan_data is None:
        print("plan failed"); return False
    if which == "plan":
        print("\nPlan OK ✅")
        return True

    gen_data = post_generate(DEFAULT_BODY)
    if gen_data is None:
        print("generate failed"); return False

    shard = get_file_json(gen_data["path"])
    if shard is None:
        print("fetch file failed"); return False

    # Validations
    errs: List[str] = []
    errs += validate_v2_basics(plan_data, shard)
    errs += validate_optional_layers(plan_data, shard)

    if errs:
        print("\n=== FAILURES ===")
        for e in errs[:50]:
            print("-", e)
        if len(errs) > 50:
            print(f"...and {len(errs)-50} more")
        print("\nRESULT: FAIL ❌")
        return False

    print("\nAll invariants passed ✅")
    print("RESULT: PASS ✅")
    return True

if __name__ == "__main__":
    which = (sys.argv[1].lower() if len(sys.argv) > 1 else "all")
    sys.exit(0 if run(which) else 1)
