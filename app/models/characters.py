import uuid, datetime as dt
from flask_login import UserMixin

from ..db import db as db


def gen_uuid() -> str:
    return str(uuid.uuid4())

class Character(db.Model):
    __tablename__ = "character"

    character_id = db.Column(db.String, primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String, db.ForeignKey("users.user_id"), nullable=False, index=True)

    # identity / creation
    name = db.Column(db.String(40), nullable=False, index=True)
    class_id = db.Column(db.String(32))  # e.g., 'warrior', 'mage'
    sex = db.Column(db.String(16))
    age = db.Column(db.SmallInteger)
    biography = db.Column(db.Text)

    # progression basics
    level = db.Column(db.Integer, default=1)
    xp = db.Column(db.BigInteger, default=0)

    # location basics
    shard_id = db.Column(db.String(64))
    x = db.Column(db.Integer)
    y = db.Column(db.Integer)

    # easy-mode state bucket (inventory, quests, flags) -> normalize later
    state = db.Column(db.JSON)

    # legacy compatibility: some databases still have an `is_deleted` column
    # defined as NOT NULL; include it with a default to satisfy inserts.
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)

    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )
    last_seen_at = db.Column(db.DateTime)


