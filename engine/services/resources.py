# server/services/resources.py
from time import time
from typing import Any

def find_node(room: dict, node_id: str) -> dict | None:
    for n in room.get("resources", []):
        if n.get("id") == node_id:
            return n
    return None

def available(node: dict) -> bool:
    if node.get("qty", 0) <= 0:
        respawn = node.get("respawn_s")
        depleted_at = node.get("depleted_at")
        if respawn and depleted_at:
            return (time() - depleted_at) >= respawn
        return False
    return True

def harvest_amount(player, node: dict) -> int:
    base = 1
    skill = getattr(player, "gather_skill", 0)
    tool_bonus = getattr(player, "tool_bonus", 0)
    return max(1, base + (skill // 10) + tool_bonus)

def apply_harvest(room: dict, node: dict, qty: int, player) -> None:
    # decrement node
    current = node.get("qty", 0)
    new_qty = max(0, current - qty)
    node["qty"] = new_qty
    if new_qty == 0:
        node["depleted_at"] = time()
    # add to inventory (player should provide add_item)
    if hasattr(player, "add_item"):
        player.add_item(node["type"], qty)

def export_room_resources(room: dict) -> list[dict[str, Any]]:
    return room.get("resources", [])
