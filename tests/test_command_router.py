import command_router as router
from app import create_app
from app.player_service import get_player
from app.models import db, Character


def test_inv_returns_table_frame():
    app = create_app()
    with app.app_context():
        char = Character(user_id="u1", name="Tester")
        db.session.add(char)
        db.session.commit()
        with app.test_request_context():
            frames = router.route('inv', None, char, db.session)
    assert frames and frames[0]['type'] == 'table'


def test_move_updates_position_and_look():
    app = create_app()
    with app.test_request_context():
        frames = router.route('s', None, None, None)
        assert any(f['type'] == 'text' and 'You move' in f['data'] for f in frames)
        player = get_player()
        assert player.pos == (0, 1)
        look_frames = router.route('look', None, None, None)
        assert any('(0,1)' in f['data'] for f in look_frames)
