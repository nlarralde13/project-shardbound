import command_router as router
from app import create_app
from app.player_service import get_player


def test_inv_returns_table_frame():
    app = create_app()
    with app.test_request_context():
        frames = router.route('inv', None, None, None)
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
