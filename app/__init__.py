# app/__init__.py
import os
import sqlalchemy as sa
from flask import Flask, render_template, send_from_directory
from .models import db
from .db import migrate
from .auth import auth_bp, login_manager
from .characters import characters_bp
from .classes_admin import classes_admin_bp
from .api_items import api_bp as api_items_bp


def create_app():
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    DB_PATH = os.path.join(BASE_DIR, "app.db")
    DB_URI = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")

    app.config.update(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev"),
        SQLALCHEMY_DATABASE_URI=DB_URI,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_SAMESITE="Lax",
    )

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    with app.app_context():
        from . import models  # ensure models are imported
        if os.environ.get("AUTO_CREATE_TABLES", "1") == "1":
            db.create_all()

            # -- temporary migrations for pre-beta databases --
            inspector = sa.inspect(db.engine)
            cols = {c["name"] for c in inspector.get_columns("character")}
            with db.engine.begin() as conn:
                # Ensure legacy column exists with safe defaults to avoid NOT NULL failures
                if "is_deleted" not in cols:
                    conn.execute(sa.text("ALTER TABLE character ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))
                if "biography" not in cols:
                    conn.execute(sa.text("ALTER TABLE character ADD COLUMN biography TEXT"))
                    if "bio" in cols:
                        conn.execute(sa.text("UPDATE character SET biography = bio"))
                if "is_active" not in cols:
                    conn.execute(sa.text("ALTER TABLE character ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))
                    if "is_deleted" in cols:
                        conn.execute(sa.text("UPDATE character SET is_active = 0 WHERE is_deleted = 1"))
                if "last_seen_at" not in cols:
                    conn.execute(sa.text("ALTER TABLE character ADD COLUMN last_seen_at DATETIME"))
                if "cur_loc" not in cols:
                    conn.execute(sa.text("ALTER TABLE character ADD COLUMN cur_loc VARCHAR(64)"))
                    if "x" in cols and "y" in cols:
                        conn.execute(sa.text(
                            "UPDATE character SET cur_loc = x || ',' || y WHERE x IS NOT NULL AND y IS NOT NULL"
                        ))

    # Blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(characters_bp)  # /api/characters
    app.register_blueprint(classes_admin_bp) #class builder admin
    app.register_blueprint(api_items_bp, url_prefix="/api")

    # Your other API blueprints (unchanged)
    from .api.routes import bp as core_api_bp
    app.register_blueprint(core_api_bp)
    from .api.actions import bp as actions_api_bp
    app.register_blueprint(actions_api_bp)
    try:
        from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp
        app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2")
        app.register_blueprint(api_bp, url_prefix="/api")
    except Exception:
        pass

    # UI routes
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/characters")
    def character_select():
        return render_template("character_select.html")

    @app.route("/characters/create")
    def character_create():
        return render_template("character_create.html")

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

    @app.route("/user_settings.html")
    def user_settings_partial():
        return render_template("user_settings.html")

    @app.route("/static/<path:filename>")
    def static_passthrough(filename):
        return send_from_directory(app.static_folder, filename)


    @app.route("/class-builder")
    def class_builder():
        return render_template("class_builder.html")

    @app.route("/itemForge")
    def item_forge():
        return render_template("item_forge.html")
    
    return app
