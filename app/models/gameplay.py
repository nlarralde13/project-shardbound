from .base import db, Model
from sqlalchemy.dialects.postgresql import JSONB


def _JSON():
    try:
        return JSONB if db.engine.url.get_backend_name() == "postgresql" else db.JSON
    except Exception:
        return db.JSON


class Town(Model):
    __tablename__ = "towns"
    town_id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    world_x = db.Column(db.Integer, nullable=False)
    world_y = db.Column(db.Integer, nullable=False)
    grid_w = db.Column(db.Integer, nullable=False, default=1)
    grid_h = db.Column(db.Integer, nullable=False, default=1)


class TownRoom(Model):
    __tablename__ = "town_rooms"
    id = db.Column(db.Integer, primary_key=True)
    town_id = db.Column(db.String(64), db.ForeignKey("towns.town_id"), nullable=False, index=True)
    room_x = db.Column(db.Integer, nullable=False)
    room_y = db.Column(db.Integer, nullable=False)
    kind = db.Column(db.String(32), nullable=False, default="room")
    label = db.Column(db.String(64))


class NPC(Model):
    __tablename__ = "npcs"
    npc_id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    kind = db.Column(db.String(32), nullable=False)


class Quest(Model):
    __tablename__ = "quests"
    quest_id = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    giver_npc_id = db.Column(db.String(64), db.ForeignKey("npcs.npc_id"))
    type = db.Column(db.String(32), nullable=False)
    target_world_x = db.Column(db.Integer)
    target_world_y = db.Column(db.Integer)
    required_item_id = db.Column(db.String(64))
    reward_json = db.Column(_JSON(), nullable=False, default=dict)


class QuestState(Model):
    __tablename__ = "quest_states"
    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.String(64), db.ForeignKey("character.character_id"), nullable=False, index=True)
    quest_id = db.Column(db.String(64), db.ForeignKey("quests.quest_id"), nullable=False)
    status = db.Column(db.String(16), nullable=False, default="available")
    updated_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now(), onupdate=db.func.now())


class CharacterState(Model):
    __tablename__ = "character_states"
    character_id = db.Column(db.String(64), db.ForeignKey("character.character_id"), primary_key=True)
    mode = db.Column(db.String(16), nullable=False, default="overworld")
    town_id = db.Column(db.String(64), db.ForeignKey("towns.town_id"))
    room_x = db.Column(db.Integer)
    room_y = db.Column(db.Integer)


class EncounterTrigger(Model):
    __tablename__ = "encounter_triggers"
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(64), nullable=False)
    world_x = db.Column(db.Integer, nullable=False)
    world_y = db.Column(db.Integer, nullable=False)
    script_id = db.Column(db.String(64), nullable=False)


class CharacterDiscovery(Model):
    __tablename__ = "character_discoveries"
    character_id = db.Column(db.String(64), db.ForeignKey("character.character_id"), primary_key=True)
    shardgate_id = db.Column(db.String(128), primary_key=True)
    discovered_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
