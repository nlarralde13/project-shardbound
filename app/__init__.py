# app/__init__.py
import os
from flask import Flask, render_template, send_from_directory
from .db import db, migrate
from .auth import auth_bp, login_manager

def create_app():
    """
    Single source of truth for app construction.
    - Binds DB, Migrate, LoginManager
    - Registers ALL blueprints (auth, core API, actions, shardEngine)
    - Declares UI routes
    """
    # Point to your root-level static/templates (adjust if your tree differs)
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    # ---- Config ----------------------------------------------------------------
    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev"),
        SQLALCHEMY_DATABASE_URI=os.environ.get("DATABASE_URL", "sqlite:///app.db"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_SAMESITE="Lax",
    )

    # ---- Extensions -------------------------------------------------------------
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Ensure models are imported so migrations can see them
    with app.app_context():
        from . import models  # noqa: F401

    # ---- Blueprints: Auth -------------------------------------------------------
    # Passwordless MVP endpoints: /api/auth/register, /api/auth/login, /api/auth/me, /api/auth/logout
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    # ---- Blueprints: Game APIs --------------------------------------------------
    from .api.routes import bp as core_api_bp
    app.register_blueprint(core_api_bp)  # served under /api/...

    from .api.actions import bp as actions_api_bp
    app.register_blueprint(actions_api_bp)  # served under /api/actions...

    # ---- Blueprints: shardEngine (external) ------------------------------------
    # Keep your existing shardEngine endpoints unchanged
    try:
        from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp
        app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
        app.register_blueprint(api_bp, url_prefix="/api")
    except Exception:
        # OK if shardEngine isn't present in a given dev env
        pass

    # ---- UI routes --------------------------------------------------------------
    @app.route("/")
    def index():
        # Your barebones login/landing page (templates/index.html)
        return render_template("index.html")

    @app.route("/mvp")
    def mvp():
        # Your game surface (templates/mvp3.html)
        return render_template("mvp3.html")

    @app.route("/api-playground")
    def api_playground():
        return render_template("api-playground.html")

    @app.route("/shard-viewer")
    def shard_viewer():
        return render_template("shard-viewer.html")

    @app.route("/shard-viewer-v2")
    def shard_viewer_v2():
        return render_template("shard-viewer-v2.html")

    # Static passthrough (keeps old links working)
    @app.route("/static/<path:filename>")
    def static_passthrough(filename):
        return send_from_directory(app.static_folder, filename)

    return app
