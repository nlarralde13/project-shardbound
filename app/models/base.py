from sqlalchemy.orm import DeclarativeMeta

# Re-export the application's SQLAlchemy instance
from ..db import db

# Convenience exports
Model: DeclarativeMeta = db.Model
metadata = db.metadata
