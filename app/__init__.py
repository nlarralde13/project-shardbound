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
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    # --- Pin SQLite path so you always hit the same file ---
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    DB_PATH = os.path.join(BASE_DIR, "app.db")
    DB_URI = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev"),
        SQLALCHEMY_DATABASE_URI=DB_URI,
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

        # --- Dev-friendly auto-create (optional) ---
        # Disable by setting AUTO_CREATE_TABLES=0 in your env.
        if os.environ.get("AUTO_CREATE_TABLES", "1") == "1":
            db.create_all()

    # ---- Blueprints: Auth -------------------------------------------------------
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    # ---- Blueprints: Game APIs --------------------------------------------------
    from .api.routes import bp as core_api_bp
    app.register_blueprint(core_api_bp)

    from .api.actions import bp as actions_api_bp
    app.register_blueprint(actions_api_bp)

    # ---- Blueprints: shardEngine (external) ------------------------------------
    try:
        from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp
        app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
        app.register_blueprint(api_bp, url_prefix="/api")
    except Exception:
        pass  # OK if not present in a given dev env

    # ---- UI routes --------------------------------------------------------------
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/mvp")
    def mvp():
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

    @app.route("/static/<path:filename>")
    def static_passthrough(filename):
        return send_from_directory(app.static_folder, filename)
    
    @app.route("/user_settings")
    def user_settings_partial():
        return render_template("user_settings.html")

    return app
