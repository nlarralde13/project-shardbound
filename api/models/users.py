import uuid, datetime as dt
from flask_login import UserMixin

from .base import db, Model


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Model, UserMixin):
    __tablename__ = "users"

    user_id = db.Column(db.String, primary_key=True, default=gen_uuid)
    email = db.Column(db.String, unique=True, nullable=False, index=True)
    handle = db.Column(db.String, unique=True, index=True)
    display_name = db.Column(db.String)
    age = db.Column(db.SmallInteger)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )
    last_login_at = db.Column(db.DateTime)

    # RBAC fields
    role = db.Column(db.String(16), nullable=False, default="user")
    scopes = db.Column(db.JSON)

    # Active character (persist across sessions)
    selected_character_id = db.Column(
        db.String, db.ForeignKey("character.character_id"), nullable=True
    )

    # convenience relationships
    characters = db.relationship(
        "Character", backref="user", lazy="dynamic", foreign_keys="Character.user_id"
    )

    def get_id(self):
        return self.user_id

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False


