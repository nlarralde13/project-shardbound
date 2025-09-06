import uuid
from types import SimpleNamespace


def test_warrior_gets_starter_kit():
    from api import create_app
    app = create_app()
    with app.test_client() as client, app.app_context():
        # seed catalog + loadout
        from db_cli import cmd_seed_items
        cmd_seed_items(SimpleNamespace(file="seeds/items/warrior_starter.json"))

        # register and login
        email = f"{uuid.uuid4().hex}@t.com"
        handle = uuid.uuid4().hex[:8]
        reg = client.post('/api/auth/register', json={'email': email, 'display_name': 'P', 'handle': handle, 'age': 20})
        assert reg.status_code == 200

        # create warrior
        created = client.post('/api/game/characters', json={'name': 'Conan', 'class_id': 'warrior'})
        assert created.status_code == 201
        cid = created.get_json()['character_id']

        # verify character_items got rows
        from api.models import db
        from api.models.inventory_v2 import CharacterItem
        rows = db.session.query(CharacterItem).filter_by(character_id=cid).all()
        # Expected from seed: 1+1+sums (3+2+1+1+2+2+1) = 13 total quantity across 9 slugs
        assert len(rows) >= 5
        total_qty = sum(int(r.quantity or 0) for r in rows)
        assert total_qty >= 12

