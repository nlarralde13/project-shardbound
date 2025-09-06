from api import create_app


def test_spawn_and_move_updates_state():
    app = create_app()
    with app.test_client() as client:
        # Spawn the player and ensure basic payload pieces exist
        resp = client.post('/api/spawn', json={})
        assert resp.status_code == 200
        data = resp.get_json()
        assert {'player', 'room', 'interactions'} <= data.keys()
        start_pos = data['player']['pos']

        # Attempt to move the player one tile to the right
        move = client.post('/api/move', json={'dx': 1, 'dy': 0})
        assert move.status_code == 200
        move_data = move.get_json()
        assert {'player', 'interactions'} <= move_data.keys()
        assert len(move_data['player']['pos']) == 2
        if move_data.get('ok'):
            assert move_data['player']['pos'] != start_pos
