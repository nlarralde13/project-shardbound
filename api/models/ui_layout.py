import datetime as dt
from .base import db, Model


class UserUILayout(Model):
    __tablename__ = "user_ui_layouts"

    user_id = db.Column(db.String, db.ForeignKey("users.user_id"), primary_key=True)
    layout = db.Column(db.JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
