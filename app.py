# app.py
"""
Thin runner that uses the unified factory and runs Socket.IO.
"""
import re, datetime as dt
from flask import Blueprint, request, jsonify
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from app.db import db as db
from app.models import User
from flask_socketio import SocketIO
from app import create_app


auth_bp = Blueprint("auth_bp", __name__)
login_manager = LoginManager()

app = create_app()
socketio = SocketIO(app, cors_allowed_origins="*")

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
