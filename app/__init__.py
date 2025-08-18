from flask import Flask
from .db import db, migrate
from flask_login import LoginManager

login_manager = LoginManager()

def create_app():
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY="dev-change-me",
        SQLALCHEMY_DATABASE_URI="postgresql+psycopg://user:pass@localhost:5432/projectmmo",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from .api.routes import api_bp
    from .auth.routes import auth_bp
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/auth")

    @app.route("/mvp2")
    def mvp2():
        from flask import render_template
        return render_template("mvp2.html")

    return app
