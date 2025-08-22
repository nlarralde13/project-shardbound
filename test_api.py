# test_api.py — v2 round-trip tester (plan → generate → fetch → validate)
import os, sys, json, uuid, argparse, webbrowser
from typing import Dict, Any, List, Tuple
import requests
from collections import deque

# ---------- CLI / ENV ----------

def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="ShardBound v2 API smoke tests")
    p.add_argument("cmd", nargs="?", default="roundtrip",
                   choices=["plan", "generate", "roundtrip", "all"],
                   help="What to run (default: roundtrip)")

    p.add_argument("--base", default=os.environ.get("BASE_URL", "http://localhost:5000"),
                   help="API base URL (default: http://localhost:5000)")
    p.add_argument("--template", default=os.environ.get("TEMPLATE_ID", "normal-16"),
                   help="Template ID (default: normal-16)")
    p.add_argument("--name", default=os.environ.get("SHARD_NAME", f"smoke_{uuid.uuid4().hex[:6]}"),
                   help="Shard base name (default: random smoke_XXXXXX)")
    p.add_argument("--seed", type=int, help="Explicit seed (disables --auto-seed)")
    p.add_argument("--auto-seed", action="store_true", default=True, help="Ask server to pick a random seed")
    p.add_argument("--poi-budget", type=int, default=int(os.environ.get("POI_BUDGET", "3")),
                   help="POI budget override (default from env or 3)")

    # settlement budgets
    p.add_argument("--cities", type=int, help="City budget")
    p.add_argument("--towns", type=int, help="Town budget")
    p.add_argument("--villages", type=int, help="Village budget")
    p.add_argument("--ports", type=int, help="Port budget")

    # biome pack id (optional, only if your backend supports it)
    p.add_argument("--biome-pack", help="Biome pack id override")

    # convenience
    p.add_argument("--open-viewer", action="store_true", help="Open /shard-viewer-v2 after generation")
    p.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds (default 30)")
    return p

# ---------- HTTP helpers ----------

def ok(status: int) -> bool:
    return 200 <= status < 300

def jdump(obj) -> str:
    try: return json.dumps(obj, indent=2)
    except Exception: return str(obj)

def get_json(resp: requests.Response):
    try: return resp.json()
    except Exception: return {"_raw": resp.text}

def http_get(base: str, path: str, timeout: int):
    url = f"{base.rstrip('/')}{path}"
    r = requests.get(url, timeout=timeout)
    return r, get_json(r)

def http_post(base: str, path: str, body: Dict[str, Any], timeout: int):
    url = f"{base.rstrip('/')}{path}"
    r = requests.post(url, json=body, timeout=timeout)
    return r, get_json(r)

# ---------- Request builders ----------

def build_body(args: argparse.Namespace) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "templateId": args.template,
        "name": args.name,
    }
    if args.seed is not None:
        body["seed"] = int(args.seed)
        body["autoSeed"] = False
    else:
        body["autoSeed"] = bool(args.auto_seed)

    overrides: Dict[str, Any] = {"poi": {"budget": int(args.poi_budget)}}

    budget: Dict[str, int] = {}
    if args.cities is not None:    budget["city"] = int(args.cities)
    if args.towns is not None:     budget["town"] = int(args.towns)
    if args.villages is not None:  budget["village"] = int(args.villages)
    if args.ports is not None:     budget["port"] = int(args.ports)
    if budget:
        overrides["settlements"] = {"budget": budget}

    if args.biome_pack:
        overrides["biomePack"] = args.biome_pack

    if overrides:
        body["overrides"] = overrides

    return body

# ---------- Core calls ----------

def get_catalog(base: str, timeout: int) -> bool:
    url = f"{base.rstrip('/')}/api/catalog"
    print(f"[GET] {url}")
    r = requests.get(url, timeout=timeout)
    print(f"  -> {r.status_code}")
    if not ok(r.status_code):
        print(jdump(get_json(r))); return False
    return True

def post_plan(base: str, timeout: int, body: Dict[str, Any]) -> Dict[str, Any] | None:
    url = f"{base.rstrip('/')}/api/shard-gen-v2/plan"
    print(f"[POST] {url}")
    r = requests.post(url, json=body, timeout=timeout)
    print(f"  -> {r.status_code}")
    data = get_json(r)
    if not ok(r.status_code) or not data.get("ok", True):
        print(jdump(data)); return None
    # normalize keys between earlier/later versions
    print(f"  plan_id: {data.get('plan_id') or data.get('planId')}  seed: {data.get('seed')}")
    return data

def post_generate(base: str, timeout: int, body: Dict[str, Any]) -> Dict[str, Any] | None:
    url = f"{base.rstrip('/')}/api/shard-gen-v2/generate"
    print(f"[POST] {url}")
    r = requests.post(url, json=body, timeout=timeout)
    print(f"  -> {r.status_code}")
    data = get_json(r)
    if not ok(r.status_code) or not data.get("ok", True):
        print(jdump(data)); return None
    print(f"  file: {data.get('file')}  path: {data.get('path')}")
    return data

def fetch_json_by_path(base: str, timeout: int, path: str) -> Dict[str, Any] | None:
    url = f"{base.rstrip('/')}{path}"
    print(f"[GET] {url}")
    r = requests.get(url, timeout=timeout)
    print(f"  -> {r.status_code}")
    if not ok(r.status_code):
        print(r.text[:300]); return None
    try:
        return r.json()
    except Exception:
        print("  !! fetched file is not JSON")
        return None

# ---------- Validation helpers ----------

def dims(grid: List[List[str]]) -> Tuple[int,int]:
    h = len(grid); w = len(grid[0]) if h else 0
    return w, h

def ring_distance(x:int,y:int,w:int,h:int) -> int:
    """Min distance to outer border (0 on border)."""
    return min(x, y, w-1-x, h-1-y)

def assert_true(cond: bool, msg: str, errs: List[str]):
    if not cond: errs.append(msg)

def looks_grid(g) -> bool:
    return isinstance(g, list) and g and isinstance(g[0], list)

# ---------- Hydrology helpers ----------

def compute_dist_to_ocean(grid: list[list[str]]) -> list[list[int]]:
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

# ---------- Validators ----------

def validate_v2_basics(plan: Dict[str,Any], shard: Dict[str,Any]) -> List[str]:
    errs: List[str] = []

    for k in ("meta","grid","layers","provenance"):
        assert_true(k in shard, f"missing '{k}' in generated shard", errs)

    grid = shard.get("grid", [])
    assert_true(looks_grid(grid), "grid is missing or not 2D", errs)
    if not looks_grid(grid):
        return errs

    W,H = dims(grid)
    meta = shard.get("meta", {})
    assert_true(W == int(meta.get("width", -1)) and H == int(meta.get("height", -1)),
                f"grid dims {W}x{H} != meta {meta.get('width')}x{meta.get('height')}", errs)

    water_layer = shard.get("layers", {}).get("water", {})
    chosen_coast_w = int(water_layer.get("coast_width", 1))
    ocean_ring = 1  # v2 stores only coast_width; border (ring=0) must be ocean

    # 1) all outer border tiles are 'ocean'
    for y in range(H):
        for x in range(W):
            if ring_distance(x,y,W,H) < ocean_ring:
                assert_true(grid[y][x] == "ocean", f"non-ocean at border ({x},{y})={grid[y][x]}", errs)

    # 2) coast belt are in 'coast/beach/marsh-lite' (fallback set)
    coast_set = {"coast", "beach", "marsh-lite"}
    for y in range(H):
        for x in range(W):
            d = ring_distance(x,y,W,H)
            if ocean_ring <= d < (ocean_ring + chosen_coast_w):
                assert_true(grid[y][x] in coast_set,
                            f"non-coast '{grid[y][x]}' in coast belt at ({x},{y})", errs)

    # 3) no 'ocean' inside interior beyond ocean+coast
    for y in range(H):
        for x in range(W):
            d = ring_distance(x,y,W,H)
            if d >= (ocean_ring + chosen_coast_w):
                assert_true(grid[y][x] != "ocean",
                            f"ocean found in interior at ({x},{y})", errs)
    return errs

def validate_hydrology(plan: dict, shard: dict) -> list[str]:
    errs: list[str] = []
    layers = shard.get("layers", {})
    hydro = layers.get("hydrology")
    if not isinstance(hydro, dict):
        return errs
    rivers = hydro.get("rivers")
    lakes = hydro.get("lakes")

    grid = shard.get("grid", [])
    if not looks_grid(grid): return errs
    W, H = dims(grid)
    dist = compute_dist_to_ocean(grid)

    if isinstance(rivers, list):
        for idx, path in enumerate(rivers):
            if not isinstance(path, list) or len(path) < 2:
                errs.append(f"river[{idx}] too short or wrong type"); continue
            last_d = None
            for (x, y) in path:
                if not (0 <= x < W and 0 <= y < H):
                    errs.append(f"river[{idx}] out of bounds at ({x},{y})"); break
                d = dist[y][x]
                if d < 0:
                    errs.append(f"river[{idx}] passes unreachable tile ({x},{y})"); break
                if last_d is not None and d >= last_d:
                    errs.append(f"river[{idx}] not descending at ({x},{y}) d={d} >= prev={last_d}"); break
                last_d = d
            else:
                # mouth must touch ocean (4-neigh)
                x, y = path[-1]
                if not any(0 <= x+dx < W and 0 <= y+dy < H and grid[y+dy][x+dx] == "ocean"
                           for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]):
                    errs.append(f"river[{idx}] mouth not adjacent to ocean at ({x},{y})")

    if isinstance(lakes, list):
        def iter_lake_tiles(l):
            if isinstance(l, dict) and "tiles" in l:
                return l["tiles"]
            return l
        for li, lake in enumerate(lakes):
            tiles = iter_lake_tiles(lake) or []
            for (x, y) in tiles:
                if grid[y][x] == "ocean":
                    errs.append(f"lake[{li}] includes ocean tile at ({x},{y})")
                if ring_distance(x, y, W, H) == 0:
                    errs.append(f"lake[{li}] touches map border at ({x},{y})")
    return errs

def validate_world_features(shard: dict, expected_budgets: dict | None) -> list[str]:
    """Check settlements/ports/roads/bridges presence against budgets."""
    errs: List[str] = []
    layers = shard.get("layers", {})
    sets = layers.get("settlements", {}) if isinstance(layers.get("settlements"), dict) else {}

    if expected_budgets:
        for key, fld in (("cities","cities"), ("towns","towns"),
                         ("villages","villages"), ("ports","ports")):
            exp = int(expected_budgets.get(key, 0))
            if exp > 0:
                got = len(sets.get(fld, []) or [])
                assert_true(got > 0, f"expected some {key} (budget {exp}) but found {got}", errs)

    # Roads/bridges format presence
    roads = layers.get("roads", {})
    if roads:
        paths = roads.get("paths")
        bridges = roads.get("bridges")
        assert_true(isinstance(paths, list), "layers.roads.paths must be a list", errs)
        assert_true(isinstance(bridges, list) or bridges is None, "layers.roads.bridges must be a list", errs)

    return errs

# ---------- Runner ----------

def run(args: argparse.Namespace) -> bool:
    BASE = args.base
    TIMEOUT = args.timeout
    V2_PREFIX = f"{BASE.rstrip('/')}/api/shard-gen-v2"

    body = build_body(args)

    print("=== ShardBound API smoke ===")
    print("BASE=", BASE)
    print("POST body=", jdump(body), sep="\n")

    if args.cmd in ("all","plan"):
        if not get_catalog(BASE, TIMEOUT):
            print("Catalog fetch failed"); return False

    plan_data = None
    if args.cmd in ("all","plan","generate","roundtrip"):
        plan_data = post_plan(BASE, TIMEOUT, body)
        if plan_data is None:
            print("Plan failed ❌"); return False
        print(f"  plan_id: {plan_data.get('plan_id') or plan_data.get('planId')}  seed: {plan_data.get('seed')}")

    if args.cmd == "plan":
        print("\nPlan OK ✅"); return True

    gen_data = post_generate(BASE, TIMEOUT, body)
    if gen_data is None:
        print("Generate failed ❌"); return False

    shard = fetch_json_by_path(BASE, TIMEOUT, gen_data["path"])
    if shard is None:
        print("Fetch shard JSON failed ❌"); return False

    # ---- validations
    errs: List[str] = []
    errs += validate_v2_basics(plan_data or {}, shard)
    errs += validate_hydrology(plan_data or {}, shard)

    budgets = {}
    if args.cities   is not None: budgets["cities"]   = args.cities
    if args.towns    is not None: budgets["towns"]    = args.towns
    if args.villages is not None: budgets["villages"] = args.villages
    if args.ports    is not None: budgets["ports"]    = args.ports
    errs += validate_world_features(shard, budgets or None)

    if errs:
        print("\n=== FAILURES ===")
        for e in errs[:50]:
            print("-", e)
        if len(errs) > 50:
            print(f"...and {len(errs)-50} more")
        print("\nRESULT: FAIL ❌")
        return False

    print("\nAll invariants passed ✅")
    print(f"RESULT: PASS ✅  →  {gen_data.get('file')}  ({gen_data.get('path')})")

    # Optional: open the v2 viewer so you can see it render right away
    if args.open_viewer:
        try:
            url = f"{BASE.rstrip('/')}/shard-viewer-v2?debug=1"
            print(f"Opening viewer: {url}")
            webbrowser.open(url)
        except Exception as e:
            print(f"(viewer open skipped: {e})")

    return True

# ---------- main ----------

if __name__ == "__main__":
    args = make_parser().parse_args()
    # If user provided --seed, disable auto-seed
    if args.seed is not None:
        args.auto_seed = False
    ok_all = run(args)
    sys.exit(0 if ok_all else 1)
