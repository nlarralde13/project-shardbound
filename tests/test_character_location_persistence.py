from app import create_app
from server.config import START_POS
import uuid


def test_cur_loc_updates_and_persists():
    app = create_app()
    with app.test_client() as client, app.app_context():
        from app.models import db, Character
        # register and login
        email = f"{uuid.uuid4().hex}@t.com"
        handle = uuid.uuid4().hex[:8]
        reg = client.post(
            '/api/auth/register',
            json={'email': email, 'display_name': 'P', 'handle': handle, 'age': 20}
        )
        assert reg.status_code == 200
        # create and select character
        created = client.post('/api/characters', json={'name': 'Hero', 'class_id': 'warrior'})
        cid = created.get_json()['character_id']
        client.post('/api/characters/select', json={'character_id': cid})
        # spawn and move
        client.post('/api/spawn', json={})
        client.post('/api/move', json={'dx': 1, 'dy': 0})
        ch = db.session.get(Character, cid)
        assert ch.x == START_POS[0] + 1
        assert ch.y == START_POS[1]
        assert ch.cur_loc == f"{ch.x},{ch.y}"
        # clear session and spawn again; position should persist
        with client.session_transaction() as sess:
            sess.clear()
        resp = client.post('/api/spawn', json={})
        data = resp.get_json()
        assert data['player']['pos'] == [START_POS[0] + 1, START_POS[1]]
