from flask import Blueprint, jsonify, request, abort
from ..models import db, Shard, Character

api_bp = Blueprint("api", __name__)

@api_bp.get("/shards/<int:shard_id>")
def get_shard(shard_id):
    shard = Shard.query.get_or_404(shard_id)
    data = shard.data_json
    # Ensure legacy fields are present for client
    return jsonify({
        "name": shard.name,
        "size": [shard.size_w, shard.size_h],
        **data
    })

@api_bp.post("/shards")
def create_shard():
    # Accepts raw shard JSON (from worldgen or client dev)
    payload = request.get_json()
    if not payload: abort(400, "Missing JSON")
    size = payload.get("size", [16,16])
    shard = Shard(
        name=payload.get("name","New Shard"),
        size_w=size[0], size_h=size[1],
        seed=str(payload.get("seed","")),
        data_json=payload
    )
    db.session.add(shard); db.session.commit()
    return jsonify({"id": shard.id}), 201

@api_bp.post("/chars")
def create_char():
    # minimal: no auth yet for speed
    p = request.get_json() or {}
    shard_id = p.get("shard_id", 1)
    name = p.get("name", "Adventurer")
    c = Character(user_id=1, shard_id=shard_id, name=name, pos_x=p.get("x",0), pos_y=p.get("y",0))
    db.session.add(c); db.session.commit()
    return jsonify({"id": c.id, "name": c.name}), 201

@api_bp.patch("/chars/<int:char_id>/move")
def move_char(char_id):
    p = request.get_json() or {}
    dir_ = (p.get("dir") or "").upper()
    d = {"N":(0,-1), "E":(1,0), "S":(0,1), "W":(-1,0)}
    if dir_ not in d: abort(400, "dir must be N/E/S/W")

    c = Character.query.get_or_404(char_id)
    dx,dy = d[dir_]; c.pos_x += dx; c.pos_y += dy
    db.session.commit()
    # return minimal payload that your client already expects to log
    return jsonify({"pos":[c.pos_x, c.pos_y]})
