"""Server package initialization."""

# Expose primary APIs for convenience
from .world_loader import load_world, get_room, add_safe_zone
from .player_engine import move, ensure_first_quest, check_quests
from .combat import maybe_spawn, resolve_combat
from .config import START_POS, START_TOWN_COORDS, PORT_TOWN_COORDS, AMBUSH_COORDS, TOWN_GRID_SIZE
