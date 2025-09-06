from .base import db, Model
from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint
from datetime import datetime

class ItemInstance(Model):
    __tablename__ = "item_instances"
    instance_id  = db.Column(db.String(64), primary_key=True)
    item_id      = db.Column(db.String(64), ForeignKey("items.item_id"), nullable=False, index=True)
    item_version = db.Column(db.String(16), nullable=False)
    quantity     = db.Column(db.Integer, nullable=False, default=1)
    created_at   = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    __table_args__ = (CheckConstraint("quantity >= 1", name="ck_item_instances_qty_pos"),)

class CharacterInventory(Model):
    __tablename__ = "character_inventory"
    id           = db.Column(db.String(64), primary_key=True)
    character_id = db.Column(db.String(64), ForeignKey("character.character_id"), nullable=False, index=True)
    slot_index   = db.Column(db.Integer, nullable=False)
    item_id      = db.Column(db.String(64), ForeignKey("items.item_id"))
    instance_id  = db.Column(db.String(64), ForeignKey("item_instances.instance_id"))
    qty          = db.Column(db.Integer, nullable=False, default=1)
    equipped     = db.Column(db.Boolean, nullable=False, default=False)
    acquired_at  = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    __table_args__ = (
        UniqueConstraint("character_id", "slot_index", name="uq_charinv_char_slot"),
        CheckConstraint("slot_index >= 0", name="ck_charinv_slot_nonneg"),
        CheckConstraint("qty >= 1", name="ck_charinv_qty_pos"),
    )
