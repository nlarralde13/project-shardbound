# app/admin_panel.py
from flask import Blueprint, request, render_template, redirect, url_for, make_response, current_app, jsonify
from flask_login import current_user

from .security import issue_admin_token, admin_required
from .security_rbac import role_gte

admin_ui = Blueprint("admin_ui", __name__)

def _admin_pwd() -> str:
    # Configure via env or config
    return (current_app.config.get("ADMIN_PANEL_PASSWORD") or
            current_app.config.get("ADMIN_PASSWORD") or
            "")

@admin_ui.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    def _auto_login():
        """Grant admin token if current session user has an admin role."""
        if current_user and getattr(current_user, "is_authenticated", False):
            if role_gte(getattr(current_user, "role", "user"), "admin"):
                token = issue_admin_token(
                    uid=getattr(current_user, "user_id", "ops"),
                    scopes=["admin"],
                    ttl=60 * 60 * 8,
                )
                resp = make_response(redirect(url_for("admin_ui.admin_panel")))
                resp.set_cookie(
                    "admin_token",
                    token,
                    max_age=60 * 60 * 8,
                    httponly=True,
                    samesite="Lax",
                    secure=False,
                )
                return resp
        return None

    if request.method == "GET":
        resp = _auto_login()
        if resp:
            return resp
        return render_template("admin_login.html")

    # POST
    resp = _auto_login()
    if resp:
        return resp
    pwd = request.form.get("password", "")
    if not _admin_pwd() or pwd != _admin_pwd():
        return render_template("admin_login.html", error="Invalid passphrase."), 401
    # scopes you can expand later (e.g., ["vault.read","forge.write"])
    token = issue_admin_token(uid="ops", scopes=["admin"], ttl=60 * 60 * 8)
    resp = make_response(redirect(url_for("admin_ui.admin_panel")))
    resp.set_cookie(
        "admin_token", token, max_age=60 * 60 * 8, httponly=True, samesite="Lax", secure=False
    )
    return resp

@admin_ui.route("/admin/logout", methods=["POST"])
def admin_logout():
    resp = make_response(redirect(url_for("admin_ui.admin_login")))
    resp.delete_cookie("admin_token")
    return resp

@admin_ui.route("/admin/api/token", methods=["POST"])
@admin_required()  # must already be logged in (cookie) to mint a shown token
def admin_api_token():
    token = issue_admin_token(uid="ops", scopes=["admin"], ttl=60*60*8)
    return jsonify({"token": token, "ttl_seconds": 60*60*8})

@admin_ui.route("/admin")
@admin_required()
def admin_panel():
    return render_template("admin_panel.html")


@admin_ui.route("/admin/console")
@admin_required()
def admin_console_page():
    return render_template("admin_console.html")
