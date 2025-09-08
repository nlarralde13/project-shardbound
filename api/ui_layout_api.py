import datetime as dt
from functools import wraps
from typing import Dict, Literal

from flask import Blueprint, request, jsonify, abort, session

from .models import db, UserUILayout

# ---- Auth helpers ---------------------------------------------------------
try:  # Flask-Login preferred
    from flask_login import current_user, login_required  # type: ignore

    def get_current_user_id() -> str:
        if not getattr(current_user, "is_authenticated", False):
            abort(401)
        return str(current_user.get_id())
except Exception:  # pragma: no cover - flask_login not installed
    def login_required(fn):  # type: ignore
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if "user_id" not in session:
                abort(401)
            return fn(*args, **kwargs)
        return wrapper

    def get_current_user_id() -> str:
        uid = session.get("user_id")
        if not uid:
            abort(401)
        return str(uid)

# ---- Rate limiter ---------------------------------------------------------
try:  # pragma: no cover - optional dependency
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(get_remote_address)
except Exception:  # pragma: no cover - limiter not available
    limiter = None  # type: ignore

# ---- Validation schema ----------------------------------------------------
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    ConfigDict,
    constr,
    conint,
    confloat,
    field_validator,
)


class SnapSchema(BaseModel):
    mode: Literal["pixel", "cols"]
    px: conint(ge=0, le=20000)
    colW: conint(ge=0, le=20000)
    model_config = ConfigDict(extra="forbid")


class PanelSchema(BaseModel):
    xPx: conint(ge=0, le=20000)
    yPx: conint(ge=0, le=20000)
    xPct: confloat(ge=0, le=100)
    yPct: confloat(ge=0, le=100)
    col: conint(ge=0, le=20000)
    z: conint(ge=0, le=20000)
    model_config = ConfigDict(extra="forbid")


class LayoutSchema(BaseModel):
    version: Literal[1]
    mode: Literal["free", "docked"]
    locked: bool
    snap: SnapSchema
    panels: Dict[constr(max_length=64), PanelSchema]
    updatedAt: conint(ge=0, le=2 ** 63 - 1)
    model_config = ConfigDict(extra="forbid")

    @field_validator("panels")
    @classmethod
    def _check_panels(cls, v: Dict[str, PanelSchema]):
        if len(v) > 64:
            raise ValueError("panels map too large")
        return v


# ---- Blueprint ------------------------------------------------------------
ui_layout_api = Blueprint("ui_layout_api", __name__)


def default_layout() -> dict:
    return {}


def _json_response(payload, status=200):
    resp = jsonify(payload)
    resp.status_code = status
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Content-Type"] = "application/json; charset=utf-8"
    return resp


@ui_layout_api.route("/layout", methods=["GET"])
@login_required
def get_layout():
    user_id = get_current_user_id()
    row = db.session.get(UserUILayout, user_id)
    payload = row.layout if row else default_layout()
    return _json_response(payload)


@ui_layout_api.route("/layout", methods=["PUT"])
@login_required
def put_layout():
    if request.content_type != "application/json":
        abort(415)
    if request.content_length and request.content_length > 64 * 1024:
        abort(413)
    try:
        data = request.get_json(force=True)
    except Exception:
        abort(400)
    try:
        layout = LayoutSchema.model_validate(data)
    except ValidationError as e:
        return _json_response({"error": e.errors()}, status=400)

    user_id = get_current_user_id()
    row = db.session.get(UserUILayout, user_id)
    if not row:
        row = UserUILayout(user_id=user_id)
    row.layout = layout.model_dump()
    row.updated_at = dt.datetime.utcnow()
    db.session.add(row)
    db.session.commit()
    return _json_response(row.layout)


# apply rate limit if available
if limiter:
    put_layout = limiter.limit("60/minute")(put_layout)
else:  # pragma: no cover
    # TODO: add real rate limiting
    pass
