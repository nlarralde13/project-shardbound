# server/services/loot.py
import random

# Tiny inline loot tables for MVP; swap to JSON later
_TABLES = {
    "meadow_common": [
        (60, {"item_id": "herb-grass", "name": "wild grass", "qty": (1, 2)}),
        (90, {"item_id": "berry", "name": "sweet berries", "qty": (1, 3)}),
        (100, {"item_id": "trinket", "name": "lost trinket", "qty": (1, 1)}),
    ]
}

def roll_table(name: str) -> dict | None:
    table = _TABLES.get(name)
    if not table:
        return None
    roll = random.randint(1, 100)
    for threshold, entry in table:
        if roll <= threshold:
            qty_range = entry.get("qty", (1, 1))
            qty = random.randint(*qty_range)
            return {**entry, "qty": qty}
    return None
