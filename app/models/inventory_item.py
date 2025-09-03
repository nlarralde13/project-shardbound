"""Join table linking characters to the items they carry."""

from .base import db, Model


class InventoryItem(Model):
    __tablename__ = "inventory_items"

    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(
        db.String, db.ForeignKey("character.character_id"), nullable=False
    )
    item_id = db.Column(
        db.Integer, db.ForeignKey("items_v1.id"), nullable=False
    )
    quantity = db.Column(db.Integer, nullable=False, default=1)

    # relationships give us convenient access to related rows
    character = db.relationship("Character", back_populates="inventory_items")
    item = db.relationship("app.models.item.Item", back_populates="inventory_entries")

    __table_args__ = (
        db.UniqueConstraint("character_id", "item_id", name="uq_character_item"),
    )

