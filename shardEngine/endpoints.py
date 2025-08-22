# /app/shardEngine/endpoints.py
from __future__ import annotations

from flask import Blueprint, request, jsonify, send_from_directory, abort, current_app
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple
import hashlib, json, random, re

# --- v2 engine deps ---
from .schemas import PlanRequest
from .registry import Registry, overrides_hash_sha1
from . import generator_v2 as gen

# --- v1 + misc deps moved from app.py ---
from shard_gen import generate_shard_from_registry, save_shard
from player_state import (
    get_player_state, patch_player_state,
    get_inventory, add_inventory_item, remove_inventory_item
)

# ------------------------
# Utilities (logging/merge/validation)
# ------------------------
ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "static"
SHARDS_DIR = STATIC_DIR / "public" / "shards"
DEBUG_DIR  = STATIC_DIR / "public" / "debug"
API_DIR    = STATIC_DIR / "public" / "api"
TIERS_DIR = Path(__file__).resolve().parent / "templates" / "tiers"
TIERS_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None
    

for p in (SHARDS_DIR, DEBUG_DIR, API_DIR):
    p.mkdir(parents=True, exist_ok=True)

def _iso_now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

def log_json(name: str, data: dict):
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    (DEBUG_DIR / f"{name}-{ts}.json").write_text(json.dumps(data, indent=2))

def deep_merge(base: dict, patch: dict) -> dict:
    if not isinstance(base, dict):
        return patch if isinstance(patch, dict) else base
    out = dict(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def clamp_grid(eff: dict) -> dict:
    g = eff.setdefault("grid", {})
    w = int(g.get("width", 16))
    h = int(g.get("height", w))
    w = max(8, min(128, w))
    h = max(8, min(128, h))
    g["width"], g["height"] = w, h
    return eff


def normalize_grid_keys(eff: dict) -> dict:
    g = eff.setdefault("grid", {})
    # prefer explicit width/height; otherwise map from cols/rows/size
    if "cols" in g and ("width" not in g or int(g.get("width", 0)) != int(g["cols"])):
        g["width"] = int(g["cols"])
    if "rows" in g and ("height" not in g or int(g.get("height", 0)) != int(g["rows"])):
        g["height"] = int(g["rows"])
    if "size" in g:
        g.setdefault("width",  int(g["size"]))
        g.setdefault("height", int(g["size"]))
    return eff


def normalize_coast_width(eff: dict) -> dict:
    water = eff.setdefault("water", {})
    cw = water.get("coast_width")
    if isinstance(cw, int):
        water["coast_width"] = (int(cw), int(cw))
    elif isinstance(cw, (list, tuple)) and len(cw) == 2:
        a, b = int(cw[0]), int(cw[1])
        water["coast_width"] = (min(a, b), max(a, b))
    return eff

# ------------------------
# V2 Shard Engine blueprint
# ------------------------
bp = Blueprint("shard_gen_v2", __name__)  # mounted at /api/shard-gen-v2

@bp.route("/", methods=["GET"])
def info():
    return jsonify({
        "ok": True, "generator": "v2", "now": _iso_now(),
        "routes": {"plan": "POST /api/shard-gen-v2/plan", "generate": "POST /api/shard-gen-v2/generate"}
    })

@bp.route("/plan", methods=["POST"])
def plan_endpoint():
    raw = request.get_json(silent=True) or {}
    try:
        req = PlanRequest(**raw)
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid request: {e}"}), 400

    reg = Registry()
    try:
        reg.load_all()
    except Exception as e:
        return jsonify({"ok": False, "error": f"registry load failed: {e}"}), 500

    # Load tier (may be {})
    try:
        tier_doc = reg.get_tier_doc(req.templateId)
        tier = tier_doc.data
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    # Right-biased merge: overrides win
    overrides_dict: Dict[str, Any] = {}
    if req.overrides is not None:
        try:
            overrides_dict = req.overrides.model_dump(exclude_none=True)
        except Exception:
            overrides_dict = req.overrides.dict(exclude_none=True)

    if req.templateId:
        overrides_dict.pop("grid", None) # <-- lock grid to tier


    effective = clamp_grid(normalize_coast_width(deep_merge(tier, overrides_dict)))
    effective = normalize_grid_keys(effective)

    # Biome pack resolution against effective config
    biome_pack_id = req.biomePack or effective.get("biomes", {}).get("pack")
    if not biome_pack_id:
        return jsonify({"ok": False, "error": "biome pack not specified in tier or request"}), 400
    try:
        biome_doc = reg.get_biome_doc(biome_pack_id)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    # Seed: specified or deterministic from inputs
    if req.seed is not None:
        seed = int(req.seed)
    else:
        basis = f"{req.name}|{req.templateId}|{overrides_hash_sha1(overrides_dict)}".encode("utf-8")
        seed = int.from_bytes(hashlib.blake2s(basis, digest_size=4).digest(), "big") % 100_000_000

    try:
        plan = gen.plan(
            req=req,
            merged_tier=effective,                 # <— use effective
            tier_prov=getattr(tier_doc, "id_at_version", req.templateId),
            biome_doc=biome_doc,
            seed=seed,
            diff={"merge": "right_biased", "overrides_hash": overrides_hash_sha1(overrides_dict)},
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"planner error: {e}"}), 500

    payload = plan if isinstance(plan, dict) else {"result": plan}
    payload.setdefault("ok", True)
    payload.setdefault("grid", effective.get("grid", {}))
    payload["debug"] = {"templateId": req.templateId, "tier": tier, "overrides": overrides_dict, "effective": effective}
    log_json("plan", {"raw": raw, "effective": effective, "resp": payload})
    return jsonify(payload), 200

@bp.route("/generate", methods=["POST"])
def generate_endpoint():
    raw = request.get_json(silent=True) or {}
    try:
        req = PlanRequest(**raw)
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid request: {e}"}), 400

    reg = Registry()
    try:
        reg.load_all()
    except Exception as e:
        return jsonify({"ok": False, "error": f"registry load failed: {e}"}), 500

    try:
        tier_doc = reg.get_tier_doc(req.templateId)
        tier = tier_doc.data
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    if req.overrides is not None:
        try:
            overrides_dict = req.overrides.model_dump(exclude_none=True)
        except Exception:
            overrides_dict = req.overrides.dict(exclude_none=True)
    else:
        overrides_dict = {}

    effective = clamp_grid(normalize_coast_width(deep_merge(tier, overrides_dict)))
    effective = normalize_grid_keys(effective)

    biome_pack_id = req.biomePack or effective.get("biomes", {}).get("pack")
    if not biome_pack_id:
        return jsonify({"ok": False, "error": "biome pack not specified in tier or request"}), 400
    try:
        biome_doc = reg.get_biome_doc(biome_pack_id)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    if req.seed is not None:
        seed = int(req.seed)
    else:
        basis = f"{req.name}|{req.templateId}|{overrides_hash_sha1(overrides_dict)}".encode("utf-8")
        seed = int.from_bytes(hashlib.blake2s(basis, digest_size=4).digest(), "big") % 100_000_000

    try:
        out = gen.generate(
            req=req,
            merged_tier=effective,                 # <— use effective
            tier_prov=getattr(tier_doc, "id_at_version", req.templateId),
            biome_doc=biome_doc,
            seed=seed,
            diff={"merge": "right_biased", "overrides_hash": overrides_hash_sha1(overrides_dict)},
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"generate error: {e}"}), 500

    payload = out if isinstance(out, dict) else {"result": out}
    payload = {"ok": True, **payload, "debug": {"effective": effective}}
    log_json("generate", {"raw": raw, "effective": effective, "resp": payload})
    return jsonify(payload), 200

# ------------------------
# General API blueprint (moved from app.py)
# ------------------------
api_bp = Blueprint("api", __name__)     # mounted at /api

# Registry presets for UI dropdown
WORLD_REGISTRY = {
    "shard_isle_of_cinder": {
        "seed": 1337, "width": 64, "height": 64,
        "biomes": ["ocean","beach","grassland","forest","mountain","volcanic"],
        "volcano": {"enabled": True, "min_radius": 2, "max_radius": 4},
        "ports": {"count": 2}, "settlements": {"count": 3},
        "landmass_ratio": 0.42,
    },
    "shard_green_coast": {
        "seed": 7331, "width": 64, "height": 64,
        "biomes": ["ocean","beach","grassland","forest","hills"],
        "volcano": {"enabled": False},
        "ports": {"count": 1}, "settlements": {"count": 4},
        "landmass_ratio": 0.55,
    },
}

SEED_PREFIX_RE = re.compile(r"^(\d{8})_")
SAFE_NAME      = re.compile(r"^[A-Za-z0-9_\-]+$")

def _existing_seed_ids() -> set[int]:
    ids = set()
    for p in SHARDS_DIR.glob("*.json"):
        m = SEED_PREFIX_RE.match(p.name)
        if m:
            try: ids.add(int(m.group(1)))
            except ValueError: pass
    return ids

def _unique_seed_id() -> int:
    used = _existing_seed_ids()
    while True:
        n = random.randint(10_000_000, 99_999_999)
        if n not in used: return n

@api_bp.route("/registry", methods=["GET"])
def api_registry():
    presets = [{"key": key, "config": WORLD_REGISTRY[key]} for key in WORLD_REGISTRY.keys()]
    return jsonify({"presets": presets})

@api_bp.route("/shards", methods=["GET"])
def list_shards():
    items = []
    for p in sorted(SHARDS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            items.append({"file": p.name, "path": f"/static/public/shards/{p.name}", "meta": data.get("meta", {})})
        except Exception:
            items.append({"file": p.name, "path": f"/static/public/shards/{p.name}", "meta": {}})
    return jsonify(items)

@api_bp.route("/shards/<name>", methods=["GET"])
def get_shard(name: str):
    safe = "".join(c for c in name if c.isalnum() or c in ("_", "-"))
    path = SHARDS_DIR / f"{safe}.json"
    if not path.exists():
        abort(404, description=f"Shard '{safe}' not found")
    return send_from_directory(path.parent, path.name, mimetype="application/json")

#ROUTE TO TEMPLATE TIERS
@bp.route("/tiers", methods=["GET"])
def list_tiers():
    items = []
    for p in sorted(TIERS_DIR.glob("*.json")):
        data = _read_json(p) or {}
        tid  = p.stem
        grid = (data.get("grid") or {})
        gw = int(grid.get("width",  grid.get("cols", grid.get("size", 16))))
        gh = int(grid.get("height", grid.get("rows", grid.get("size", 16))))
        items.append({
            "id": tid,
            "label": data.get("label") or tid,
            "grid": {"width": gw, "height": gh},
            "defaults": {
                "water": data.get("water") or {},
                "world": data.get("world") or {},
                "noise": data.get("noise") or {},
                "hydrology": data.get("hydrology") or {},
                "settlements": data.get("settlements") or {},
                "poi": data.get("poi") or {},
                "biomes": data.get("biomes") or {},
            }
        })
    return jsonify(items)




@api_bp.route("/generate_shard", methods=["POST"])
def generate_shard():
    body = request.get_json(silent=True) or {}

    template = body.get("template") or body.get("name")
    base_name = body.get("name") or template
    auto_seed = bool(body.get("autoSeed", False))
    seed_id   = body.get("seedId")
    overrides = body.get("overrides") or {}

    if not template:
        return jsonify({"error": "Missing 'template' or 'name'"}), 400
    if not SAFE_NAME.match(base_name):
        return jsonify({"error": "Invalid 'name' (allowed: letters, numbers, _ and -)"}), 400

    # Seed selection / uniqueness
    if seed_id is None or auto_seed:
        seed_id = _unique_seed_id()
    else:
        if int(seed_id) in _existing_seed_ids():
            seed_id = _unique_seed_id()

    # Force deterministic seed
    overrides = {**overrides, "seed": int(seed_id)}

    prefixed_name = f"{int(seed_id):08d}_{base_name}"

    try:
        shard = generate_shard_from_registry(template, WORLD_REGISTRY, overrides=overrides)
        shard.meta.name = prefixed_name
        shard.meta.displayName = base_name.replace("_", " ").title()
        shard.meta.seed = int(seed_id)

        out = save_shard(shard, SHARDS_DIR)
        meta = shard.meta.__dict__ | {"seedId": int(seed_id), "template": template}
        return jsonify({"ok": True, "file": out.name, "path": f"/static/public/shards/{out.name}", "meta": meta})
    except KeyError:
        return jsonify({"error": f"template '{template}' not found in registry"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Player
@api_bp.route("/player", methods=["GET"])
def api_get_player():
    return jsonify(get_player_state())

@api_bp.route("/player", methods=["PATCH"])
def api_patch_player():
    body = request.get_json(silent=True) or {}
    updated = patch_player_state(body)
    return jsonify(updated)

# Inventory
@api_bp.route("/inventory", methods=["GET"])
def api_get_inventory():
    return jsonify(get_inventory())

@api_bp.route("/inventory", methods=["POST"])
def api_add_inventory_item():
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(add_inventory_item(body))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@api_bp.route("/inventory", methods=["DELETE"])
def api_remove_inventory_item():
    body = request.get_json(silent=True) or {}
    try:
        iid = body.get("id")
        qty = body.get("qty")
        return jsonify(remove_inventory_item(iid, qty if qty is not None else None))
    except (ValueError, KeyError) as e:
        code = 404 if isinstance(e, KeyError) else 400
        return jsonify({"error": str(e)}), code

# API catalog (same behavior as before)
CATALOG_FILE = API_DIR / "catalog.json"
IGNORED_RULES = {"static"}

def build_api_catalog():
    endpoints = []
    for rule in current_app.url_map.iter_rules():
        if rule.endpoint in IGNORED_RULES:
            continue
        path = str(rule)
        if not path.startswith("/api"):
            continue
        methods = sorted(m for m in rule.methods if m not in {"HEAD", "OPTIONS"})
        for m in methods:
            accepts_json = m in {"POST", "PUT", "PATCH", "DELETE"}
            endpoints.append({"method": m, "path": path, "acceptsJsonBody": accepts_json})
    return {"service": "Shardbound Flask API", "generatedAt": _iso_now(), "endpoints": endpoints}

@api_bp.route("/catalog", methods=["GET"])
def api_catalog():
    if CATALOG_FILE.exists():
        try:
            return send_from_directory(CATALOG_FILE.parent, CATALOG_FILE.name, mimetype="application/json")
        except Exception:
            pass
    return jsonify(build_api_catalog())

@api_bp.route("/catalog/refresh", methods=["POST"])
def api_catalog_refresh():
    cat = build_api_catalog()
    CATALOG_FILE.write_text(json.dumps(cat, indent=2))
    return jsonify({"ok": True, "path": f"/static/public/api/{CATALOG_FILE.name}", "count": len(cat["endpoints"])})

# Optional: route map under /api/debug/routes
@api_bp.route("/debug/routes", methods=["GET"])
def api_debug_routes():
    routes = []
    for rule in current_app.url_map.iter_rules():
        methods = sorted(m for m in rule.methods if m not in {"HEAD","OPTIONS"})
        routes.append({"path": str(rule), "methods": methods, "endpoint": rule.endpoint})
    return jsonify(routes)
