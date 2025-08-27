# server/game_state.py
from pathlib import Path
from .world_loader import load_world
from .player_engine import Player

# Default shard (match your current path)
STARTER_SHARD_PATH = Path("static/public/shards/00089451_test123.json")

WORLD = load_world(STARTER_SHARD_PATH)
PLAYER = Player()
