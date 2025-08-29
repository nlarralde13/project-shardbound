from .base import db, Model
from sqlalchemy.dialects.postgresql import JSONB


def _JSON():
    try:
        return JSONB if db.engine.url.get_backend_name() == "postgresql" else db.JSON
    except Exception:
        # Fallback when called outside application context
        return db.JSON

class Item(Model):
    __tablename__ = "items"
    item_id = db.Column(db.String(64), primary_key=True)
    item_version = db.Column(db.String(16), nullable=False)
    name = db.Column(db.String(128), nullable=False)
    type = db.Column(db.String(16), nullable=False)      # weapon/armor/consumable/...
    rarity = db.Column(db.String(16), nullable=False)    # common..mythic
    stack_size = db.Column(db.Integer, nullable=False, default=1)
    base_stats = db.Column(_JSON(), nullable=False, default=dict)
    # ... (rest as needed)
