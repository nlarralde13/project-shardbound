from __future__ import annotations

import datetime as dt
from .base import db, Model


class StarterLoadout(Model):
    __tablename__ = "starter_loadouts"

    id = db.Column(db.Integer, primary_key=True)
    class_name = db.Column("class", db.String(32), nullable=False, index=True)
    level_min = db.Column(db.Integer, nullable=False, default=1)
    level_max = db.Column(db.Integer, nullable=False, default=1)
    item_id = db.Column(db.String(64), db.ForeignKey("items.item_id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)


class CharacterItem(Model):
    __tablename__ = "character_items"

    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.String(64), db.ForeignKey("character.character_id"), nullable=False, index=True)
    item_id = db.Column(db.String(64), db.ForeignKey("items.item_id"), nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    slot = db.Column(db.String(32))
    durability = db.Column(db.Integer)
    bound = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)

