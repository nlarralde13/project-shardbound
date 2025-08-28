# app.py
"""
Thin runner that uses the unified factory and runs Socket.IO.
"""

from flask_socketio import SocketIO
from app import create_app

app = create_app()
socketio = SocketIO(app, cors_allowed_origins="*")

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
