# app.py
from pathlib import Path
from flask import Flask, render_template, send_from_directory, jsonify, request
from server.world_loader import load_world
from server.player_engine import Player, move, ensure_first_quest, check_quests
from server.combat import maybe_spawn, resolve_combat

# v2 + general API blueprints (keep your existing)
from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp

app = Flask(__name__, static_folder="static", template_folder="templates")

# ---- World bootstrap ---------------------------------------------------------
# Load the starter shard from static/public/shards so front-end paths line up.
STARTER_SHARD_PATH = Path("static/public/shards/00089451_test123.json")
WORLD = load_world(STARTER_SHARD_PATH)
PLAYER = Player()

# ---- Blueprints --------------------------------------------------------------
app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
app.register_blueprint(api_bp,         url_prefix="/api")

# ---- UI routes ---------------------------------------------------------------
@app.route("/")
def index():
    return render_template("mvp3.html")

@app.route("/api-playground")
def api_playground():
    return render_template("api-playground.html")

@app.route("/shard-viewer")
def shard_viewer():
    return render_template("shard-viewer.html")

@app.route("/shard-viewer-v2")
def shard_viewer_v2():
    return render_template("shard-viewer-v2.html")

# ---- Lightweight shard catalog for the picker -------------------------------
@app.get("/api/shards")
def api_shards():
    """List JSON shards found under static/public/shards/."""
    base = Path("static/public/shards")
    items = []
    for p in sorted(base.glob("*.json")):
        # Keep shape simple & stable for the front-end
        items.append({
            "path": f"/static/public/shards/{p.name}",
            "file": p.name,
            "meta": {
                "displayName": p.stem.replace("_", " ").title(),
                "name": p.stem,
            }
        })
    return jsonify(items)

# ---- World meta --------------------------------------------------------------
@app.get("/api/world")
def api_world():
    return jsonify({
        "id": getattr(WORLD, "id", "starter"),
        "size": getattr(WORLD, "size", [16, 16]),
        "pois": getattr(WORLD, "pois", []),
        "roads": getattr(WORLD, "roads", []),
    })

# ---- Spawn -------------------------------------------------------------------
@app.post("/api/spawn")
def api_spawn():
    data = request.get_json(force=True) or {}
    x, y = int(data.get("x", 12)), int(data.get("y", 15))  # default spawn requested
    PLAYER.spawn(x, y)

    # devmode noclip via query string ?noclip=1
    if request.args.get("noclip") == "1":
        PLAYER.flags["noclip"] = True

    ensure_first_quest(PLAYER)
    return jsonify({"ok": True, "player": PLAYER.__dict__})

# ---- Movement + encounters ---------------------------------------------------
@app.post("/api/move")
def api_move():
    data = request.get_json(force=True) or {}
    dx, dy = int(data.get("dx", 0)), int(data.get("dy", 0))

    res = move(WORLD, PLAYER, dx, dy)  # applies rules (respecting protected layers, etc.)
    log = res.get("log", [])

    # simple encounter roll — roads are safer (handled inside maybe_spawn or your logic)
    biome = WORLD.biome_at(*PLAYER.pos)
    enemy = maybe_spawn(biome)
    if enemy:
        log += resolve_combat(PLAYER, enemy)

    check_quests(WORLD, PLAYER, log)

    res["player"] = PLAYER.__dict__
    res["log"] = log
    return jsonify(res)

# ---- Interaction at POIs -----------------------------------------------------
@app.post("/api/interact")
def api_interact():
    p = WORLD.poi_at(*PLAYER.pos)
    if not p:
        return jsonify({"ok": False, "log": ["Nothing to interact with here."]})
    return jsonify({"ok": True, "poi": p, "log": [f"You arrive at a {p['type']}"]})

# ---- Player state ------------------------------------------------------------
@app.get("/api/state")
def api_state():
    return jsonify({"player": PLAYER.__dict__})

# ---- Static passthrough ------------------------------------------------------
@app.route("/static/<path:filename>")
def static_passthrough(filename):
    return send_from_directory(app.static_folder, filename)

# ---- Main --------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
