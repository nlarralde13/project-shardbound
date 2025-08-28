import uuid, datetime as dt
from .db import db as db
from flask_login import UserMixin


def gen_uuid(): return str(uuid.uuid4())

class User(db.Model, UserMixin):
    __tablename__ = "users"
    user_id = db.Column(db.String, primary_key=True, default=gen_uuid)
    email = db.Column(db.String, unique=True, nullable=False, index=True)
    handle = db.Column(db.String, unique=True, index=True)
    display_name = db.Column(db.String)
    age = db.Column(db.SmallInteger)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    last_login_at = db.Column(db.DateTime)



    # Active character (persist across sessions)
    selected_character_id = db.Column(db.String, db.ForeignKey("character.character_id"), nullable=True)

    # convenience relationships
    characters = db.relationship("Character", backref="user", lazy="dynamic", foreign_keys="Character.user_id")

    def get_id(self): return self.user_id
    @property
    def is_authenticated(self): return True
    @property
    def is_anonymous(self): return False


#CHARACTER DB MODEL 
class Character(db.Model):
    __tablename__ = "character"
    character_id = db.Column(db.String, primary_key=True, default=gen_uuid)
    user_id = db.Column(db.String, db.ForeignKey("users.user_id"), nullable=False, index=True)

    # identity / creation
    name = db.Column(db.String(40), nullable=False, index=True)
    class_id = db.Column(db.String(32))       # e.g., 'warrior', 'mage' (content id)
    sex = db.Column(db.String(16))            # placeholder for now
    age = db.Column(db.SmallInteger)
    bio = db.Column(db.Text)

    # progression basics
    level = db.Column(db.Integer, default=1)
    xp = db.Column(db.BigInteger, default=0)

    # location basics
    shard_id = db.Column(db.String(64))
    x = db.Column(db.Integer)
    y = db.Column(db.Integer)

    # easy-mode state bucket (inventory, quests, flags) -> normalize later
    state = db.Column(db.JSON)

    is_deleted = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)