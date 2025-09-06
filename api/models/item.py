"""Basic item model used for the inventory system.

Each row describes an item type (like "iron-sword").
Players hold references to these items in their inventory rows.
Comments keep explanations simple for younger readers.
"""

from .base import db, Model


class Item(Model):
    __tablename__ = "items_v1"

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(64), unique=True, index=True, nullable=False)
    display_name = db.Column(db.String(120), nullable=False)
    icon_url = db.Column(db.String(256), nullable=False)
    stackable = db.Column(db.Boolean, nullable=False, default=True)
    max_stack = db.Column(db.Integer, nullable=False, default=99)
    rarity = db.Column(db.String(16), nullable=False, default="common")
    description = db.Column(db.Text)

    # allow reverse lookups: item -> inventory rows
    inventory_entries = db.relationship(
        "InventoryItem", back_populates="item", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # helpful for debugging
        return f"<Item {self.slug}>"

