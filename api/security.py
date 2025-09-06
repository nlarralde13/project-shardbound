# api/security.py
from __future__ import annotations
from functools import wraps
from typing import Iterable, Optional
from flask import current_app, request, abort, g
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
import time

DEFAULT_TTL = 60 * 60 * 8  # 8 hours

def _serializer() -> URLSafeTimedSerializer:
    secret = current_app.config.get("SECRET_KEY")
    if not secret:
        raise RuntimeError("SECRET_KEY must be configured to use admin tokens.")
    return URLSafeTimedSerializer(secret_key=secret, salt="admin-panel-v1")

def issue_admin_token(
    uid: str = "ops",
    scopes: Optional[Iterable[str]] = None,
    ttl: Optional[int] = None,
) -> str:
    """Create a signed admin token. Store only minimal data."""
    s = _serializer()
    payload = {
        "uid": uid,
        "scopes": list(scopes or []),
        "iat": int(time.time()),
        "ttl": int(ttl or DEFAULT_TTL),
        "typ": "admin",
    }
    return s.dumps(payload)

def verify_admin_token(token: str, required_scopes: Optional[Iterable[str]] = None) -> dict:
    s = _serializer()
    try:
        data = s.loads(token, max_age=DEFAULT_TTL * 2)  # hard ceiling
    except SignatureExpired:
        abort(401, description="Admin token expired.")
    except BadSignature:
        abort(401, description="Invalid admin token.")

    if data.get("typ") != "admin":
        abort(401, description="Wrong token type.")
    # TTL check (soft; allows shorter per-token ttl)
    if int(time.time()) > int(data.get("iat", 0)) + int(data.get("ttl", DEFAULT_TTL)):
        abort(401, description="Admin token TTL exceeded.")

    req = set(required_scopes or [])
    have = set(data.get("scopes") or [])
    if req and not req.issubset(have):
        abort(403, description="Missing required admin scopes.")

    return data

def _extract_token() -> Optional[str]:
    # Priority: Authorization: Bearer, then X-Admin-Token, then cookie 'admin_token'
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    hdr = request.headers.get("X-Admin-Token")
    if hdr: return hdr
    return request.cookies.get("admin_token")

def admin_guard(required_scopes: Optional[Iterable[str]] = None):
    token = _extract_token()
    if not token:
        abort(401, description="Admin token required.")
    g.admin = verify_admin_token(token, required_scopes)

def admin_required(required_scopes: Optional[Iterable[str]] = None):
    """Decorator for view functions."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            admin_guard(required_scopes)
            return fn(*args, **kwargs)
        return wrapper
    return deco
