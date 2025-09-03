import command_router as router


def test_inv_returns_table_frame():
    frames = router.route('inv', None, None, None)
    assert frames and frames[0]['type'] == 'table'


def test_n_routes_to_movement_move():
    frames = router.route('n', None, None, None)
    assert any(f['type'] == 'text' and 'move north' in f['data'] for f in frames)
