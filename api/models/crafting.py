from .base import db, Model
from sqlalchemy import ForeignKey

class Recipe(Model):
    __tablename__ = "recipes"
    recipe_id = db.Column(db.String(64), primary_key=True)
    produces_item_id = db.Column(db.String(64), ForeignKey("items.item_id"), nullable=False)
    # inputs, station, time_ms...
