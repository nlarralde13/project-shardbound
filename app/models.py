from .db import db
from datetime import datetime

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Shard(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    size_w = db.Column(db.Integer, default=16)
    size_h = db.Column(db.Integer, default=16)
    seed = db.Column(db.String(64))
    data_json = db.Column(db.JSON, nullable=False)  # {spawn, grid, sites...}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Character(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    shard_id = db.Column(db.Integer, db.ForeignKey("shard.id"), nullable=False)
    name = db.Column(db.String(64), nullable=False)
    level = db.Column(db.Integer, default=1)
    stats_json = db.Column(db.JSON, default=dict)
    pos_x = db.Column(db.Integer, default=0)
    pos_y = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
