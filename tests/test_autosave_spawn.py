from api import create_app
from engine.config import START_POS
import uuid


def test_autosave_before_spawn_does_not_override_start():
    app = create_app()
    with app.test_client() as client, app.app_context():
        from api.models import Character
        # register and login
        email = f"{uuid.uuid4().hex}@t.com"
        handle = uuid.uuid4().hex[:8]
        client.post('/api/auth/register', json={'email': email, 'display_name': 'P', 'handle': handle, 'age': 20})
        # create and select character
        created = client.post('/api/characters', json={'name': 'Hero', 'class_id': 'warrior'})
        cid = created.get_json()['character_id']
        client.post('/api/characters/select', json={'character_id': cid})
        # autosave with bogus position prior to spawn
        client.post('/api/characters/autosave', json={'x': 2, 'y': 0})
        ch = Character.query.get(cid)
        # position should remain at the intended start coords
        coords = ch.last_coords or {}
        assert (coords.get("x"), coords.get("y")) == START_POS
        # spawning should still land at START_POS
        resp = client.post('/api/spawn', json={})
        data = resp.get_json()
        assert data['player']['pos'] == [START_POS[0], START_POS[1]]

