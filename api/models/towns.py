from .base import db, Model

class Town(Model):
    __tablename__ = "towns"

    town_id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    x = db.Column(db.Integer, nullable=False)
    y = db.Column(db.Integer, nullable=False)
    width = db.Column(db.Integer, nullable=False)
    height = db.Column(db.Integer, nullable=False)
