"""Simple RBAC helpers for roles and scopes."""
from __future__ import annotations

from functools import wraps
from typing import Callable

from flask import jsonify, request
from flask_login import current_user


ROLE_ORDER = ["user", "moderator", "gm", "admin", "dev"]


def role_gte(a: str, b: str) -> bool:
    try:
        return ROLE_ORDER.index(a) >= ROLE_ORDER.index(b)
    except ValueError:
        return False


def get_user_from_session():
    if current_user and getattr(current_user, "is_authenticated", False):
        return current_user
    return None


def has_scope(user, scope: str) -> bool:
    if not user:
        return False
    if getattr(user, "role", "user") in ("admin", "dev"):
        return True
    scopes = set(user.scopes or [])
    return scope in scopes


def require_role(min_role: str):
    def deco(fn: Callable):
        @wraps(fn)
        def inner(*a, **kw):
            u = get_user_from_session()
            if not u or not role_gte(getattr(u, "role", "user"), min_role):
                return jsonify(error="forbidden"), 403
            return fn(*a, **kw)

        return inner

    return deco


def require_scopes(*scopes: str):
    def deco(fn: Callable):
        @wraps(fn)
        def inner(*a, **kw):
            u = get_user_from_session()
            if not u:
                return jsonify(error="unauthorized"), 401
            if getattr(u, "role", "user") in ("admin", "dev"):
                return fn(*a, **kw)
            if all(has_scope(u, s) for s in scopes):
                return fn(*a, **kw)
            return jsonify(error="forbidden"), 403

        return inner

    return deco


def audit(action: str, target_type: str | None = None, target_id: str | None = None, payload=None):
    """Write an admin audit log entry."""
    try:
        from .models import db, AdminAuditLog

        u = get_user_from_session()
        log = AdminAuditLog(
            actor_user_id=getattr(u, "user_id", None),
            action=action,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            ip=request.remote_addr,
        )
        db.session.add(log)
        db.session.commit()
    except Exception:
        # fail-soft: never break main flow
        pass

