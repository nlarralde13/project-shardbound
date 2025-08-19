# app/api/routes.py
import os, json
from flask import Blueprint, current_app, jsonify, abort

bp = Blueprint('api', __name__, url_prefix='/api')

def _shards_dir():
    # points to <project_root>/static/public/shards
    return os.path.abspath(os.path.join(current_app.root_path, '..', 'static', 'public', 'shards'))

@bp.get('/shards')
def list_shards():
    d = _shards_dir()
    if not os.path.isdir(d):
        return jsonify([])
    files = [f for f in os.listdir(d) if f.endswith('.json')]
    return jsonify(sorted(files))

@bp.get('/shards/<name>')
def get_shard(name: str):
    # allow /api/shards/shard_isle_of_cinder or /api/shards/shard_isle_of_cinder.json
    filename = name if name.endswith('.json') else f'{name}.json'
    d = _shards_dir()
    path = os.path.join(d, filename)
    if not os.path.isfile(path):
        abort(404, description='Shard not found')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)
