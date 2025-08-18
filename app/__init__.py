# app/__init__.py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

def create_app(config_object=None):
    app = Flask(__name__, static_folder="../static", template_folder="../templates")

    # --- Config ---
    # Use env vars in real use; this keeps it simple for now
    app.config.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///app.db")
    app.config.setdefault("SQLALCHEMY_TRACK_MODIFICATIONS", False)
    app.config.setdefault("SECRET_KEY", "dev-secret")

    if config_object:
        app.config.from_object(config_object)

    # --- Extensions ---
    db.init_app(app)
    migrate.init_app(app, db)

    # --- Blueprints / Routes ---
    from .api.routes import api_bp
    app.register_blueprint(api_bp, url_prefix="/api")

    # If you want a simple landing route here too:
    @app.get("/")
    def root():
        # serve your MVP2 page by default
        from flask import render_template
        return render_template("mvp2.html")

    return app
