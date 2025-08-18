# app/api/routes.py
from flask import Blueprint, jsonify, send_from_directory, current_app

api_bp = Blueprint("api", __name__)

@api_bp.get("/health")
def health():
    return jsonify(ok=True)

# Shard endpoint (serves your JSON files)
@api_bp.get("/shards/<name>")
def get_shard(name):
    # e.g. /api/shards/shard_isle_of_cinder.json
    # Will read from static/public/shards/
    return send_from_directory(
        current_app.root_path + "/../static/public/shards",
        name,
        mimetype="application/json"
    )
