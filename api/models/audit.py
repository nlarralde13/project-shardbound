import datetime as dt

from .base import db, Model


class AdminAuditLog(Model):
    __tablename__ = "admin_audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    actor_user_id = db.Column(db.String, db.ForeignKey("users.user_id"))
    action = db.Column(db.String(128), nullable=False)
    target_type = db.Column(db.String(64))
    target_id = db.Column(db.String(64))
    payload = db.Column(db.JSON)
    ip = db.Column(db.String(64))
    created_at = db.Column(
        db.DateTime, nullable=False, default=dt.datetime.utcnow
    )

