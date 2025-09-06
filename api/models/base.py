from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeMeta

# Single SQLAlchemy instance shared by the app
db = SQLAlchemy()

# Convenience exports
Model: DeclarativeMeta = db.Model
metadata = db.metadata
