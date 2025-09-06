# app/__init__.py
import os
import json
import logging
import sqlalchemy as sa
from flask import Flask, render_template, send_from_directory

# Use an alias for the real SQLAlchemy instance to avoid shadowing by a module named "app.db"
from .models.base import db as SA_DB  # <- single SQLAlchemy() instance
from flask_migrate import Migrate
migrate = Migrate()

# Blueprints (unchanged – keep your work)
from .auth import auth_bp, login_manager
from .characters import characters_bp
from .classes_admin import classes_admin_bp
from .api_items import api as api_items_bp
from .api.catalog import bp as catalog_api_bp
from .api_admin import admin_api
from .security import admin_guard
from .admin_panel import admin_ui
from .api_inventory import bp as inventory_api_bp
from .api.api_console import api_console

def _json_column_type_for(engine) -> str:
    return "TEXT" if engine.dialect.name == "sqlite" else "JSON"

def _column_names(inspector: sa.engine.reflection.Inspector, table: str) -> set[str]:
    try:
        return {c["name"] for c in inspector.get_columns(table)}
    except Exception:
        return set()

def _add_column_if_missing(conn: sa.engine.Connection, inspector, table: str, column: str, ddl: str):
    cols = _column_names(inspector, table)
    if column not in cols:
        conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

def _backfill_coords(conn: sa.engine.Connection, have_xy: bool):
    if have_xy:
        rows = conn.execute(sa.text("SELECT character_id, x, y FROM character")).fetchall()
        for cid, x, y in rows:
            if x is not None and y is not None:
                coords = json.dumps({"x": int(x), "y": int(y)})
                conn.execute(sa.text(
                    "UPDATE character SET last_coords=:c WHERE last_coords IS NULL AND character_id=:cid"
                ), {"c": coords, "cid": cid})
                conn.execute(sa.text(
                    "UPDATE character SET first_time_spawn=:c WHERE first_time_spawn IS NULL AND character_id=:cid"
                ), {"c": coords, "cid": cid})
    else:
        conn.execute(sa.text("""
            UPDATE character
            SET first_time_spawn = json_object(
              'x', CAST(substr(cur_loc, 1, instr(cur_loc, ',')-1) AS INT),
              'y', CAST(substr(cur_loc, instr(cur_loc, ',')+1) AS INT)
            )
            WHERE first_time_spawn IS NULL
              AND cur_loc IS NOT NULL
        """))
        conn.execute(sa.text("""
            UPDATE character
            SET last_coords = first_time_spawn
            WHERE last_coords IS NULL AND first_time_spawn IS NOT NULL
        """))

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

    # Init core extensions with the un-shadowable alias
    SA_DB.init_app(app)
    migrate.init_app(app, SA_DB)
    login_manager.init_app(app)

    # Helpful startup log
    app.logger.setLevel(logging.INFO)
    app.logger.info("DB URI: %s", app.config["SQLALCHEMY_DATABASE_URI"])
    app.logger.info("AUTO_CREATE_TABLES=%s", os.environ.get("AUTO_CREATE_TABLES", "1"))

    with app.app_context():
        # Ensure all models are imported so metadata is complete
        from . import models as _models  # noqa: F401

        # ===== DEV SAFETY MODE =====
        # Keep your original "startup safety" block, guarded by AUTO_CREATE_TABLES.
        if os.environ.get("AUTO_CREATE_TABLES", "1") == "1":
            SA_DB.create_all()

            inspector = sa.inspect(SA_DB.engine)
            cols = _column_names(inspector, "character")
            if cols:
                json_type = _json_column_type_for(SA_DB.engine)
                with SA_DB.engine.begin() as conn:
                    _add_column_if_missing(conn, inspector, "character", "is_deleted", "BOOLEAN NOT NULL DEFAULT 0")
                    _add_column_if_missing(conn, inspector, "character", "biography", "TEXT")
                    if "biography" in _column_names(inspector, "character") and "bio" in cols:
                        conn.execute(sa.text("UPDATE character SET biography = bio WHERE biography IS NULL"))

                    _add_column_if_missing(conn, inspector, "character", "is_active", "BOOLEAN NOT NULL DEFAULT 1")
                    if "is_deleted" in cols:
                        conn.execute(sa.text("UPDATE character SET is_active = 0 WHERE is_deleted = 1"))

                    _add_column_if_missing(conn, inspector, "character", "last_seen_at", "DATETIME")
                    _add_column_if_missing(conn, inspector, "character", "cur_loc", "VARCHAR(64)")
                    if "cur_loc" in _column_names(inspector, "character") and "x" in cols and "y" in cols:
                        conn.execute(sa.text(
                            "UPDATE character SET cur_loc = x || ',' || y "
                            "WHERE cur_loc IS NULL AND x IS NOT NULL AND y IS NOT NULL"
                        ))

                    _add_column_if_missing(conn, inspector, "character", "x", "x INTEGER")
                    _add_column_if_missing(conn, inspector, "character", "y", "y INTEGER")

                    _add_column_if_missing(conn, inspector, "character", "first_time_spawn", f"{json_type}")
                    _add_column_if_missing(conn, inspector, "character", "last_coords", f"{json_type}")

                    cols_after = _column_names(inspector, "character")
                    have_xy = "x" in cols_after and "y" in cols_after
                    _backfill_coords(conn, have_xy)

                    # RBAC columns on users
                    _add_column_if_missing(conn, inspector, "users", "role", "role VARCHAR(16) NOT NULL DEFAULT 'user'")
                    json_type = _json_column_type_for(SA_DB.engine)
                    _add_column_if_missing(conn, inspector, "users", "scopes", f"scopes {json_type}")

    # Blueprints (your existing ones)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    # Register catalog API before legacy items endpoints to take precedence for /api/items
    app.register_blueprint(catalog_api_bp)
    app.register_blueprint(characters_bp)            # legacy /api/characters
    app.register_blueprint(classes_admin_bp)
    app.register_blueprint(api_items_bp, url_prefix="/api", name="items_api")
    app.register_blueprint(admin_api)
    app.register_blueprint(admin_ui)
    app.register_blueprint(inventory_api_bp)
    app.register_blueprint(api_console, url_prefix="/api/console")

    # Gameplay API
    try:
        from .api_gameplay import bp as gameplay_bp
        app.register_blueprint(gameplay_bp)          # /api/game/...
    except Exception as e:
        app.logger.warning("api_gameplay not registered: %s", e)

    # Other APIs you had
    from .api.routes import bp as core_api_bp
    app.register_blueprint(core_api_bp)
    from .api.actions import bp as actions_api_bp
    app.register_blueprint(actions_api_bp)
    try:
        from shardEngine.endpoints import bp as shard_gen_v2_bp, api_bp
        app.register_blueprint(shard_gen_v2_bp, url_prefix="/api/shard-gen-v2", name="shard_gen_v2")
        app.register_blueprint(api_bp, url_prefix="/api/shard-engine", name="shard_engine_api")
    except Exception as e:
        app.logger.warning("shardEngine endpoints not registered: %s", e)

    # Simple filesystem-backed shard CRUD for editor (/api/shards)
    try:
        from .api_shards import bp as shards_fs_bp
        app.register_blueprint(shards_fs_bp)
    except Exception as e:
        app.logger.warning("/api/shards not registered: %s", e)

    # UI routes (unchanged)
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

    @app.route("/play")
    def play():
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
        admin_guard()
        return render_template("item_forge.html")

    @app.route("/vault")
    def data_vault():
        admin_guard()
        return render_template("theVault.html")

    return app
