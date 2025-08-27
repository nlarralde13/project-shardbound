# server/services/idempotency.py
# MVP: in-memory cache; replace with DB table later.
_CACHE: dict[tuple[str, str], dict] = {}

def lookup(player_id: str, action_id: str) -> dict | None:
    return _CACHE.get((player_id, action_id))

def persist(player_id: str, action_id: str, verb: str, payload: dict, result: dict) -> None:
    _CACHE[(player_id, action_id)] = {
        "player_id": player_id,
        "action_id": action_id,
        "verb": verb,
        "payload": payload,
        "result": result,
    }
