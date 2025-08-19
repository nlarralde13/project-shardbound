# player_state.py
from datetime import datetime
from typing import Dict, List

# In-memory state (DB later)
_PLAYER: Dict = {
    "id": "player-001",
    "name": "Aerin",
    "level": 1,
    "xp": 0,
    "hp": 100,
    "mp": 25,
    "stamina": 100,
    "position": {"shard": "shard_isle_of_cinder", "x": 9, "y": 9},
    "last_updated": datetime.utcnow().isoformat() + "Z",
}

_INVENTORY: List[Dict] = [
    {"id": "itm-copper-001", "name": "Copper Coin", "qty": 25},
    {"id": "itm-wood-branch", "name": "Wood Branch", "qty": 3},
]

# -------- Player --------
def get_player_state() -> Dict:
    return _PLAYER

def patch_player_state(update: Dict) -> Dict:
    for k, v in update.items():
        if k in ("id",):  # protect immutable fields
            continue
        _PLAYER[k] = v
    _PLAYER["last_updated"] = datetime.utcnow().isoformat() + "Z"
    return _PLAYER

# -------- Inventory --------
def get_inventory() -> Dict:
    return {"items": _INVENTORY}

def add_inventory_item(item: Dict) -> Dict:
    # expects {id, name, qty}
    iid = item.get("id")
    if not iid or "name" not in item or "qty" not in item:
        raise ValueError("Missing id/name/qty")
    for it in _INVENTORY:
        if it["id"] == iid:
            it["qty"] += int(item["qty"])
            return {"items": _INVENTORY}
    _INVENTORY.append({"id": iid, "name": item["name"], "qty": int(item["qty"])})
    return {"items": _INVENTORY}

def remove_inventory_item(iid: str, qty: int | None = None) -> Dict:
    if not iid:
        raise ValueError("Missing id")
    for i, it in enumerate(_INVENTORY):
        if it["id"] == iid:
            if qty is None:
                _INVENTORY.pop(i)
            else:
                it["qty"] -= int(qty)
                if it["qty"] <= 0:
                    _INVENTORY.pop(i)
            return {"items": _INVENTORY}
    raise KeyError("Item not found")
