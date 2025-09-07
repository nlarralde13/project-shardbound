from api import create_app
from api.models import db, User, Character, Item, ItemInstance, CharacterItem

def build_app():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        u = User(user_id="u1", email="a@a")
        db.session.add(u)
        c = Character(name="Hero", user_id=u.user_id)
        db.session.add(c)
        db.session.flush()
        tmpl = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stats={"attack":1}, slot="main_hand")
        db.session.add(tmpl)
        inst = ItemInstance(instance_id="inst1", item_id="sword", item_version="1")
        db.session.add(inst)
        db.session.add(CharacterItem(character_id=c.character_id, item_id="sword", quantity=1))
        db.session.commit()
        return app, c.character_id, inst.instance_id


def test_api_flow():
    app, cid, inst = build_app()
    with app.test_client() as client:
        r = client.get(f"/api/characters/{cid}/loadout")
        assert r.status_code == 200
        r = client.post(f"/api/characters/{cid}/equip", json={"item_instance_id": inst, "slot": "main_hand"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["equipped"]["main_hand"]["item_instance_id"] == inst
        r = client.post(f"/api/characters/{cid}/unequip", json={"slot": "main_hand"})
        assert r.status_code == 200
        data = r.get_json()
        assert "main_hand" not in data["equipped"]
        r = client.post(f"/api/characters/{cid}/recompute")
        assert r.status_code == 200
