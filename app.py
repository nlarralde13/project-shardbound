# app.py
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort, render_template
from datetime import datetime
import re
import random
import json

# Local modules
from shard_gen import generate_shard_from_registry, save_shard
from player_state import (
    get_player_state, patch_player_state,
    get_inventory, add_inventory_item, remove_inventory_item
)

app = Flask(__name__, static_folder="static", template_folder="templates")

ROOT = Path(__file__).parent.resolve()
STATIC_SHARDS_DIR = ROOT / "static" / "public" / "shards"
STATIC_SHARDS_DIR.mkdir(parents=True, exist_ok=True)

# Keep registry in app (optionally move to registry.py later)
WORLD_REGISTRY = {
    "shard_isle_of_cinder": {
        "seed": 1337,
        "width": 64,
        "height": 64,
        "biomes": ["ocean", "beach", "grassland", "forest", "mountain", "volcanic"],
        "volcano": {"enabled": True, "min_radius": 2, "max_radius": 4},
        "ports": {"count": 2},
        "settlements": {"count": 3},
        "landmass_ratio": 0.42,
    },
    "shard_green_coast": {
        "seed": 7331,
        "width": 64,
        "height": 64,
        "biomes": ["ocean", "beach", "grassland", "forest", "hills"],
        "volcano": {"enabled": False},
        "ports": {"count": 1},
        "settlements": {"count": 4},
        "landmass_ratio": 0.55,
    },
}

# -------- helpers for 8-digit seed id & filename prefix --------
SEED_PREFIX_RE = re.compile(r"^(\d{8})_")

def _existing_seed_ids(shards_dir: Path) -> set[int]:
    ids = set()
    for p in shards_dir.glob("*.json"):
        m = SEED_PREFIX_RE.match(p.name)
        if m:
            try:
                ids.add(int(m.group(1)))
            except ValueError:
                pass
    return ids

def _unique_seed_id(shards_dir: Path) -> int:
    used = _existing_seed_ids(shards_dir)
    while True:
        n = random.randint(10_000_000, 99_999_999)
        if n not in used:
            return n

SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]+$")

# -------- UI --------
@app.route("/")
def index():
    return render_template("mvp2.html")

@app.route("/api-playground")
def api_playground():
    return render_template("api-playground.html")

# -------- Registry (for UI dropdown) --------
@app.route("/api/registry", methods=["GET"])
def api_registry():
    """List available registry presets."""
    presets = [{"key": key, "config": WORLD_REGISTRY[key]} for key in WORLD_REGISTRY.keys()]
    return jsonify({"presets": presets})

# -------- Shards --------
@app.route("/api/shards", methods=["GET"])
def list_shards():
    items = []
    for p in sorted(STATIC_SHARDS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            items.append({"file": p.name, "path": f"/static/public/shards/{p.name}", "meta": data.get("meta", {})})
        except Exception:
            items.append({"file": p.name, "path": f"/static/public/shards/{p.name}", "meta": {}})
    return jsonify(items)

@app.route("/api/shards/<name>", methods=["GET"])
def get_shard(name: str):
    safe = "".join(c for c in name if c.isalnum() or c in ("_", "-"))
    path = STATIC_SHARDS_DIR / f"{safe}.json"
    if not path.exists():
        abort(404, description=f"Shard '{safe}' not found")
    return send_from_directory(path.parent, path.name, mimetype="application/json")

@app.route("/api/generate_shard", methods=["POST"])
def generate_shard():
    """
    Request body:
    {
      "template": "shard_isle_of_cinder",   // registry key used for generation (optional; defaults to name)
      "name": "shard_fire_island",          // base name used for display & filename (optional; defaults to template)
      "seedId": 12345678,                   // optional; server ensures uniqueness; ignored if autoSeed=true
      "autoSeed": true,                     // optional; if true or seedId missing → server assigns unique 8-digit
      "overrides": { ... }                  // optional; merged on top of registry[template]; 'seed' is forced to seedId
    }

    Behavior:
      - Picks a unique 8-digit seed if autoSeed=true or no seedId provided.
      - Calls the generator with `template` (registry key).
      - Saves JSON as '<seedId>_<name>.json'.
      - Returns meta including chosen seedId.
    """
    body = request.get_json(silent=True) or {}

    template = body.get("template") or body.get("name")
    base_name = body.get("name") or template
    auto_seed = bool(body.get("autoSeed", False))
    seed_id = body.get("seedId")
    overrides = body.get("overrides") or {}

    if not template:
        return jsonify({"error": "Missing 'template' or 'name'"}), 400
    if not SAFE_NAME.match(base_name):
        return jsonify({"error": "Invalid 'name' (allowed: letters, numbers, _ and -)"}), 400

    # Seed id selection / uniqueness
    if seed_id is None or auto_seed:
        seed_id = _unique_seed_id(STATIC_SHARDS_DIR)
    else:
        # Avoid filename collision if caller reuses an existing id
        if int(seed_id) in _existing_seed_ids(STATIC_SHARDS_DIR):
            seed_id = _unique_seed_id(STATIC_SHARDS_DIR)

    # Force generator seed to seed_id (deterministic)
    overrides = {**overrides, "seed": int(seed_id)}

    # Prefixed filename
    prefixed_name = f"{int(seed_id):08d}_{base_name}"

    try:
        # Generate using the registry template (not necessarily equal to 'name')
        shard = generate_shard_from_registry(template, WORLD_REGISTRY, overrides=overrides)

        # Save with the prefixed on-disk name
        shard.meta.name = prefixed_name
        shard.meta.displayName = base_name.replace("_", " ").title()
        shard.meta.seed = int(seed_id)

        out = save_shard(shard, STATIC_SHARDS_DIR)
        meta = shard.meta.__dict__ | {"seedId": int(seed_id), "template": template}
        return jsonify({
            "ok": True,
            "file": out.name,
            "path": f"/static/public/shards/{out.name}",
            "meta": meta
        })
    except KeyError:
        return jsonify({"error": f"template '{template}' not found in registry"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------- Player --------
@app.route("/api/player", methods=["GET"])
def api_get_player():
    return jsonify(get_player_state())

@app.route("/api/player", methods=["PATCH"])
def api_patch_player():
    body = request.get_json(silent=True) or {}
    updated = patch_player_state(body)
    return jsonify(updated)

# -------- Inventory --------
@app.route("/api/inventory", methods=["GET"])
def api_get_inventory():
    return jsonify(get_inventory())

@app.route("/api/inventory", methods=["POST"])
def api_add_inventory_item():
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(add_inventory_item(body))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/inventory", methods=["DELETE"])
def api_remove_inventory_item():
    body = request.get_json(silent=True) or {}
    try:
        iid = body.get("id")
        qty = body.get("qty")
        return jsonify(remove_inventory_item(iid, qty if qty is not None else None))
    except (ValueError, KeyError) as e:
        code = 404 if isinstance(e, KeyError) else 400
        return jsonify({"error": str(e)}), code

# -------- Static passthrough --------
@app.route("/static/<path:filename>")
def static_passthrough(filename):
    return send_from_directory(app.static_folder, filename)

# -------- API catalog (unchanged, handy for Playground) --------
CATALOG_PATH = (ROOT / "static" / "public" / "api")
CATALOG_PATH.mkdir(parents=True, exist_ok=True)
CATALOG_FILE = CATALOG_PATH / "catalog.json"
IGNORED_RULES = {"static"}
JSON_BODIES = {
    "/api/generate_shard": {
        "template": "shard_isle_of_cinder",
        "name": "shard_fire_island",
        "autoSeed": True,
        "overrides": {"settlements": {"count": 3}}
    },
    "/api/player": {"name": "Aerin II"},
    "/api/inventory": {"id": "itm-iron-ore", "qty": 1},
}

def build_api_catalog(app):
    endpoints = []
    for rule in app.url_map.iter_rules():
        if rule.endpoint in IGNORED_RULES:
            continue
        path = str(rule)
        if not path.startswith("/api"):
            continue
        methods = sorted(m for m in rule.methods if m not in {"HEAD", "OPTIONS"})
        for m in methods:
            accepts_json = m in {"POST", "PUT", "PATCH", "DELETE"}
            sample = None
            if accepts_json and path in JSON_BODIES:
                sample = JSON_BODIES[path]
            endpoints.append({
                "method": m,
                "path": path,
                "acceptsJsonBody": accepts_json,
                "sampleBody": sample,
            })
    return {
        "service": "Shardbound Flask API",
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "endpoints": endpoints,
    }

@app.route("/api/catalog", methods=["GET"])
def api_catalog():
    if CATALOG_FILE.exists():
        try:
            return send_from_directory(CATALOG_FILE.parent, CATALOG_FILE.name, mimetype="application/json")
        except Exception:
            pass
    return jsonify(build_api_catalog(app))

@app.route("/api/catalog/refresh", methods=["POST"])
def api_catalog_refresh():
    cat = build_api_catalog(app)
    CATALOG_FILE.write_text(json.dumps(cat, indent=2))
    return jsonify({"ok": True, "path": f"/static/public/api/{CATALOG_FILE.name}", "count": len(cat["endpoints"])})


@app.route("/shard-viewer")
def shard_viewer():
    return render_template("shard-viewer.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
