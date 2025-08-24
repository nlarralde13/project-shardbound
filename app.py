# app.py
from pathlib import Path
from flask import Flask, render_template, send_from_directory

# v2 + general API blueprints
from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp

app = Flask(__name__, static_folder="static", template_folder="templates")

# Mount blueprints
app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
app.register_blueprint(api_bp,         url_prefix="/api")

# ----- UI routes (HTML only) -----
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



# Static passthrough (unchanged)
@app.route("/static/<path:filename>")
def static_passthrough(filename):
    return send_from_directory(app.static_folder, filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
