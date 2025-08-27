# app.py
"""
App entrypoint.
- Keeps UI routes (templates, static) here for clarity.
- All API endpoints live in app/api/routes.py (registered as a blueprint).
- Existing shardEngine blueprints are registered unchanged.
"""

from flask import Flask, render_template, send_from_directory
from flask_socketio import SocketIO

# Keep your existing shardEngine blueprints
# (generator v2 + general API in shardEngine)
from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp

app = Flask(__name__, static_folder="static", template_folder="templates")
socketio = SocketIO(app, cors_allowed_origins="*")
app.config["SECRET_KEY"] = "dev"
# ---- Blueprints --------------------------------------------------------------
# Shard generation v2 (unchanged)
app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
# ShardEngine's own API (unchanged)
app.register_blueprint(api_bp, url_prefix="/api")

# Core game API (moved from app.py → app/api/routes.py)
from app.api.routes import bp as core_api_bp  # noqa: E402
app.register_blueprint(core_api_bp)  # served under /api/...

from app.api.actions import bp as actions_api_bp
app.register_blueprint(actions_api_bp)


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
 
# ---- Static passthrough ------------------------------------------------------
@app.route("/static/<path:filename>")
def static_passthrough(filename):
    return send_from_directory(app.static_folder, filename)

# ---- Main --------------------------------------------------------------------
if __name__ == "__main__":
    # Debug server for local development
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
