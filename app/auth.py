import re, datetime as dt
from flask import Blueprint, request, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from .models import db, User

auth_bp = Blueprint("auth_bp", __name__)
login_manager = LoginManager()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HANDLE_RE = re.compile(r"^[a-z0-9_]{3,32}$", re.I)

@login_manager.user_loader
def load_user(user_id):  # called by Flask-Login using session cookie
    return User.query.get(user_id)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    display_name = (data.get("display_name") or "").strip()
    handle = (data.get("handle") or "").strip()
    age = data.get("age")

    if not EMAIL_RE.match(email): return jsonify(error="Invalid email."), 400
    if not display_name: return jsonify(error="Display name required."), 400
    if not HANDLE_RE.match(handle): return jsonify(error="Handle must be 3–32 letters, digits, underscores."), 400
    try:
        age = int(age)
    except Exception:
        return jsonify(error="Age must be a number."), 400
    if age < 13: return jsonify(error="Must be 13+."), 400

    if User.query.filter_by(email=email).first():
        return jsonify(error="Email already registered."), 409
    if User.query.filter_by(handle=handle).first():
        return jsonify(error="Handle already taken."), 409

    u = User(email=email, display_name=display_name, handle=handle, age=age)
    db.session.add(u)
    db.session.commit()
    login_user(u, remember=True)
    u.last_login_at = dt.datetime.utcnow()
    db.session.commit()
    return jsonify(user_id=u.user_id, handle=u.handle, display_name=u.display_name), 200

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email): return jsonify(error="Invalid email."), 400

    u = User.query.filter_by(email=email).first()
    if not u:
        return jsonify(error="User not found."), 404

    if not u.is_active:
        return jsonify(error="Account disabled."), 403

    login_user(u, remember=True)
    u.last_login_at = dt.datetime.utcnow()
    db.session.commit()
    return jsonify(user_id=u.user_id, handle=u.handle, display_name=u.display_name), 200

@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    u = current_user
    return jsonify(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        age=u.age, is_active=u.is_active, created_at=u.created_at.isoformat(),
        last_login_at=(u.last_login_at.isoformat() if u.last_login_at else None)
    ), 200


@auth_bp.route("/update", methods=["PATCH"])
@login_required
def update_user():
    data = request.get_json(force=True) or {}
    u = current_user
    changed = False

    # email
    if "email" in data:
        email = (data.get("email") or "").strip().lower()
        if not EMAIL_RE.match(email):
            return jsonify(error="Invalid email."), 400
        if email != u.email and User.query.filter_by(email=email).first():
            return jsonify(error="Email already in use."), 409
        u.email = email
        changed = True

    # handle
    if "handle" in data:
        handle = (data.get("handle") or "").strip()
        if not HANDLE_RE.match(handle):
            return jsonify(error="Handle must be 3–32 letters, digits, underscores."), 400
        if handle != u.handle and User.query.filter_by(handle=handle).first():
            return jsonify(error="Handle already taken."), 409
        u.handle = handle
        changed = True

    # display name
    if "display_name" in data:
        dn = (data.get("display_name") or "").strip()
        if not dn:
            return jsonify(error="Display name required."), 400
        u.display_name = dn
        changed = True

    # age
    if "age" in data:
        try:
            age = int(data.get("age"))
        except Exception:
            return jsonify(error="Age must be a number."), 400
        if age < 13:
            return jsonify(error="Must be 13+."), 400
        u.age = age
        changed = True

    if changed:
        u.updated_at = dt.datetime.utcnow()
        db.session.commit()

    return jsonify(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        age=u.age, is_active=u.is_active, created_at=u.created_at.isoformat(),
        last_login_at=(u.last_login_at.isoformat() if u.last_login_at else None)
    ), 200

@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify(ok=True), 200
