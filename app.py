# app.py (root)
from app import create_app, db  # so CLI can see db if needed
app = create_app()


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
