import datetime as dt
from sqlalchemy.orm import validates
from sqlalchemy import UniqueConstraint, ForeignKey

from .base import db, Model

EQUIP_SLOTS = [
    "head","chest","legs","feet","hands","main_hand","off_hand",
    "neck","ring1","ring2","belt","back"
]

class CharacterEquipped(Model):
    __tablename__ = "character_equipped"

    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.String(64), ForeignKey("character.character_id", ondelete="CASCADE"), nullable=False, index=True)
    slot = db.Column(db.String(32), nullable=False, index=True)
    item_instance_id = db.Column(db.String(64), ForeignKey("item_instances.instance_id"), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("character_id", "slot", name="uq_character_equipped_slot"),
    )

    character = db.relationship("Character", back_populates="equipped_items")
    item_instance = db.relationship("ItemInstance")

    @validates("slot")
    def validate_slot(self, key, value):
        if value not in EQUIP_SLOTS:
            raise ValueError("invalid slot")
        return value

