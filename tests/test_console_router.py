import command_router as router
from app import create_app
from app.models import db, Character


def test_resolve_alias():
    assert router.resolve('north').name == 'n'


def test_route_inv_returns_table():
    app = create_app()
    with app.app_context():
        char = Character(user_id='u1', name='Tester')
        db.session.add(char)
        db.session.commit()
        with app.test_request_context():
            frames = router.route('inv', None, char, db.session)
    assert frames and frames[0]['type'] == 'table'


def test_unknown_command_error():
    frames = router.route('frobnicate', None, None, None)
    assert frames and frames[0]['type'] == 'text'
    assert 'Unknown command' in frames[0]['data']


def test_length_guard():
    long_line = 'x' * 513
    frames = router.route(long_line, None, None, None)
    assert frames and frames[0]['type'] == 'text'
    assert 'too long' in frames[0]['data'].lower()

