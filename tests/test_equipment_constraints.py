import pytest
from api import create_app
from api.models import db, User, Character, Item, ItemInstance, CharacterItem, CharacterEquipped
import sqlalchemy as sa


def prepare_app():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        user = User(user_id="u", email="x@x")
        db.session.add(user)
        char = Character(name="Hero", user_id=user.user_id)
        db.session.add(char)
        db.session.flush()
        item = Item(item_id="itm", item_version="1", name="Itm", type="weapon", rarity="common", stats={}, slot="main_hand")
        db.session.add(item)
        inst = ItemInstance(instance_id="inst", item_id="itm", item_version="1")
        db.session.add(inst)
        db.session.add(CharacterItem(character_id=char.character_id, item_id=item.item_id, quantity=1))
        cid = char.character_id
        iid = inst.instance_id
        db.session.commit()
    return app, cid, iid


def test_unique_constraints_and_cascade():
    app, cid, inst_id = prepare_app()
    with app.app_context():
        ce1 = CharacterEquipped(character_id=cid, slot="main_hand", item_instance_id=inst_id)
        db.session.add(ce1)
        db.session.commit()
        # duplicate slot should violate
        ce2 = CharacterEquipped(character_id=cid, slot="main_hand", item_instance_id="other")
        db.session.add(ce2)
        with pytest.raises(sa.exc.IntegrityError):
            db.session.commit()
        db.session.rollback()
        # duplicate item_instance_id across characters
        user2 = User(user_id="u2", email="b@b")
        db.session.add(user2)
        char2 = Character(name="Other", user_id=user2.user_id)
        db.session.add(char2)
        db.session.flush()
        db.session.commit()
        ce3 = CharacterEquipped(character_id=char2.character_id, slot="off_hand", item_instance_id=inst_id)
        db.session.add(ce3)
        with pytest.raises(sa.exc.IntegrityError):
            db.session.commit()
        db.session.rollback()
        # cascade delete
        db.session.delete(Character.query.get(cid))
        db.session.commit()
        assert db.session.query(CharacterEquipped).filter_by(character_id=cid).count() == 0
