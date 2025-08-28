# server/game_state.py
from pathlib import Path
from .world_loader import load_world, add_safe_zone
from .player_engine import Player

# Default shard (match your current path)
STARTER_SHARD_PATH = Path("static/public/shards/00089451_test123.json")

WORLD = load_world(STARTER_SHARD_PATH)
PLAYER = Player()
# starter spawn position within the town
PLAYER.spawn(12, 15)
add_safe_zone(12, 15)
add_safe_zone(13, 15)  # NPC tile
WORLD.pois.append({"x": 12, "y": 15, "type": "town"})
