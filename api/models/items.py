from .base import db, Model
from sqlalchemy.dialects.postgresql import JSONB
import datetime as dt


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

    # Forward-looking catalog fields (nullable for backward compatibility)
    slug = db.Column(db.String(128), unique=True, index=True)
    catalog_no = db.Column(db.String(64), unique=True, index=True)
    description = db.Column(db.Text)
    slot = db.Column(db.String(32))               # e.g. head, chest, mainhand, offhand
    stackable = db.Column(db.Boolean)
    max_stack = db.Column(db.Integer)
    level_req = db.Column(db.Integer, default=1)
    icon_path = db.Column(db.String(256))
    weight = db.Column(db.Float)
    value = db.Column(db.Integer)
    stats = db.Column(_JSON())
    on_use = db.Column(_JSON())
    on_equip = db.Column(_JSON())
    tags = db.Column(_JSON())                     # list of tags
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
