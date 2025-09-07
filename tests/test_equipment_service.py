import pytest

from api import create_app
from api.models import db, User, Character, Item, ItemInstance, CharacterItem
from services.equipment import equip_item, unequip_slot, EquipError
from services.derived_stats import build_snapshot


def setup_data():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        user = User(user_id="u1", email="e@e")
        db.session.add(user)
        char = Character(name="Hero", user_id=user.user_id)
        db.session.add(char)
        db.session.flush()
        sword = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stats={"attack": 5}, slot="main_hand")
        axe = Item(item_id="axe", item_version="1", name="Axe", type="weapon", rarity="common", stats={"attack": 7}, slot="main_hand")
        db.session.add_all([sword, axe])
        inst1 = ItemInstance(instance_id="inst1", item_id="sword", item_version="1")
        inst2 = ItemInstance(instance_id="inst2", item_id="axe", item_version="1")
        db.session.add_all([inst1, inst2])
        db.session.add(CharacterItem(character_id=char.character_id, item_id="sword", quantity=1))
        db.session.add(CharacterItem(character_id=char.character_id, item_id="axe", quantity=1))
        db.session.commit()
        return app, char.character_id, inst1.instance_id, inst2.instance_id


def test_non_owner_rejected():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        user1 = User(user_id="u1", email="a@a")
        user2 = User(user_id="u2", email="b@b")
        db.session.add_all([user1, user2])
        char1 = Character(name="Hero1", user_id=user1.user_id)
        char2 = Character(name="Hero2", user_id=user2.user_id)
        db.session.add_all([char1, char2])
        db.session.flush()
        sword = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stats={}, slot="main_hand")
        db.session.add(sword)
        inst = ItemInstance(instance_id="inst1", item_id="sword", item_version="1")
        db.session.add(inst)
        db.session.add(CharacterItem(character_id=char2.character_id, item_id="sword", quantity=1))
        db.session.commit()
        with pytest.raises(EquipError):
            equip_item(character_id=char1.character_id, item_instance_id=inst.instance_id, slot="main_hand")


def test_equip_replace_and_unequip():
    app, cid, inst1, inst2 = setup_data()
    with app.app_context():
        dto = equip_item(character_id=cid, item_instance_id=inst1, slot="main_hand")
        assert dto["equipped"]["main_hand"]["item_instance_id"] == inst1
        dto = equip_item(character_id=cid, item_instance_id=inst2, slot="main_hand")
        assert dto["equipped"]["main_hand"]["item_instance_id"] == inst2
        dto = unequip_slot(character_id=cid, slot="main_hand")
        assert "main_hand" not in dto["equipped"]


def test_snapshot_changes():
    app, cid, inst1, inst2 = setup_data()
    with app.app_context():
        equip_item(character_id=cid, item_instance_id=inst1, slot="main_hand")
        snap1 = build_snapshot(cid)["sources_hash"]
        equip_item(character_id=cid, item_instance_id=inst2, slot="main_hand")
        snap2 = build_snapshot(cid)["sources_hash"]
        assert snap1 != snap2
