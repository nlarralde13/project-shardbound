import command_router as router


def test_help_summary_lists_commands():
    frames = router.route('help', None, None, None)
    table = next(f['data'] for f in frames if f['type'] == 'table')
    assert any(row['command'] == 'use' for row in table)


def test_help_detail_shows_usage_and_examples():
    frames = router.route('help use', None, None, None)
    text = next(f['data'] for f in frames if f['type'] == 'text')
    assert 'Usage: use <item>' in text
    assert 'Examples:' in text
