from api import create_app
from api.models import db, User, Character, Item, CharacterItem


def setup_app():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        user = User(user_id="u1", email="a@a")
        db.session.add(user)
        char = Character(name="Hero", user_id=user.user_id)
        db.session.add(char)
        db.session.flush()
        sword = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stack_size=1, slot="mainhand", slug="sword")
        potion = Item(item_id="potion", item_version="1", name="Potion", type="consumable", rarity="common", stack_size=10, stackable=True, max_stack=10, slot="gadget", slug="potion")
        db.session.add_all([sword, potion])
        db.session.add(CharacterItem(character_id=char.character_id, item_id="sword", quantity=1, slot="mainhand"))
        db.session.add(CharacterItem(character_id=char.character_id, item_id="potion", quantity=2))
        db.session.commit()
        return app, char.character_id


def test_inventory_and_equipment_dto():
    app, cid = setup_app()
    with app.test_client() as client:
        r = client.get(f"/api/characters/{cid}/inventory")
        assert r.status_code == 200
        data = r.get_json()
        assert data["character_id"] == cid
        items = { (it["slug"], it.get("equipped")) for it in data["items"] }
        assert ("sword", True) in items
        assert ("potion", False) in items
        r = client.get(f"/api/characters/{cid}/equipment")
        eq = r.get_json()
        assert "mainhand" in eq and eq["mainhand"]["slug"] == "sword"


def test_equip_stack_split_vs_move():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        u = User(user_id="u1", email="a@a")
        db.session.add(u)
        c = Character(name="Hero", user_id=u.user_id)
        db.session.add(c)
        db.session.flush()
        sword = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stack_size=1, slot="mainhand", slug="sword")
        potion = Item(item_id="potion", item_version="1", name="Potion", type="consumable", rarity="common", stack_size=10, stackable=True, max_stack=10, slot="gadget", slug="potion")
        db.session.add_all([sword, potion])
        db.session.add(CharacterItem(character_id=c.character_id, item_id="potion", quantity=3))
        db.session.add(CharacterItem(character_id=c.character_id, item_id="sword", quantity=1))
        db.session.commit()
        cid = c.character_id
    with app.test_client() as client:
        r = client.post(f"/api/characters/{cid}/equip", json={"slug": "potion", "slot": "gadget"})
        assert r.status_code == 200
        with app.app_context():
            inv = CharacterItem.query.filter_by(character_id=cid, item_id="potion", slot=None).first()
            equipped = CharacterItem.query.filter_by(character_id=cid, item_id="potion", slot="gadget").first()
            assert inv.quantity == 2
            assert equipped and equipped.quantity == 1
        r = client.post(f"/api/characters/{cid}/equip", json={"slug": "sword", "slot": "main_hand"})
        assert r.status_code == 200
        with app.app_context():
            sword_row = CharacterItem.query.filter_by(character_id=cid, item_id="sword").first()
            assert sword_row.slot == "mainhand"


def test_unequip_stack_merge():
    app = create_app()
    with app.app_context():
        db.drop_all(); db.create_all()
        u = User(user_id="u1", email="a@a")
        db.session.add(u)
        c = Character(name="Hero", user_id=u.user_id)
        db.session.add(c)
        db.session.flush()
        potion = Item(item_id="potion", item_version="1", name="Potion", type="consumable", rarity="common", stack_size=10, stackable=True, max_stack=10, slot="gadget", slug="potion")
        db.session.add(potion)
        db.session.add(CharacterItem(character_id=c.character_id, item_id="potion", quantity=2))
        db.session.add(CharacterItem(character_id=c.character_id, item_id="potion", quantity=1, slot="gadget"))
        db.session.commit()
        cid = c.character_id
    with app.test_client() as client:
        r = client.post(f"/api/characters/{cid}/unequip", json={"slot": "gadget"})
        assert r.status_code == 200
        with app.app_context():
            inv = CharacterItem.query.filter_by(character_id=cid, item_id="potion", slot=None).first()
            assert inv.quantity == 3
            assert CharacterItem.query.filter_by(character_id=cid, slot="gadget").count() == 0
