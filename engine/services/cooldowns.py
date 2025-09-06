# server/services/cooldowns.py
from time import time

_COOLDOWNS: dict[tuple[str, str], float] = {}

def allowed(player_id: str, key: str, min_seconds: float = 0.0) -> bool:
    last = _COOLDOWNS.get((player_id, key), 0.0)
    return (time() - last) >= min_seconds

def consume(player_id: str, key: str, seconds: float) -> bool:
    if not allowed(player_id, key, seconds):
        return False
    _COOLDOWNS[(player_id, key)] = time()
    return True
