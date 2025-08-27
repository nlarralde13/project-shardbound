# app/__init__.py
from flask import Flask
from .db import db, migrate

def create_app():
    # Point to your existing root-level static/templates
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    # Minimal config; adjust later
    app.config.update(
        SECRET_KEY="dev",
        SQLALCHEMY_DATABASE_URI="sqlite:///app.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Blueprints
    from .api.routes import bp as api_bp
    app.register_blueprint(api_bp)

    # Ensure models are imported so migrations see them
    with app.app_context():
        from . import models  # noqa: F401

    return app
