# app/__init__.py
from flask import Flask
from .db import db, migrate

def create_app():
    # Point to your existing root-level static/templates
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    # Minimal config; adjust later
    app.config.setdefault("SECRET_KEY", "dev")
    app.config.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///app.db")
    app.config.setdefault("SQLALCHEMY_TRACK_MODIFICATIONS", False)

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Blueprints
    from .api.routes import bp as api_bp
    app.register_blueprint(api_bp)

    # Ensure models are imported so migrations see them
    with app.app_context():
        import app.models  # noqa: F401

    return app
