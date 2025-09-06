"""Inventory command executors."""

from __future__ import annotations

from typing import Any, Dict, List

from api.services import items as item_svc


def _require_character(ctx: Dict[str, Any]) -> str | None:
    """Return character_id from context or ``None`` if missing."""
    char = ctx.get("character") if ctx else None
    return getattr(char, "character_id", None) or getattr(char, "id", None)


def inv(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the character's inventory as a table frame."""
    cid = _require_character(ctx)
    if not cid:
        return [{"type": "text", "data": "No character"}]
    rows = item_svc.get_character_inventory(cid)
    data = [
        {
            "slot": r["slot"],
            "item": r["name"],
            "qty": r["qty"],
            "equipped": "yes" if r["equipped"] else "no",
        }
        for r in rows
    ]
    return [{"type": "table", "data": data}]


def inspect_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Inspect an item by id."""
    args = cmd.get("args", []) if cmd else []
    if not args:
        return [{"type": "text", "data": "Usage: inspect <item_id>"}]
    item = item_svc.inspect_item(args[0])
    if not item:
        return [{"type": "text", "data": "Item not found"}]
    text = f"{item['name']} ({item['item_id']})"
    return [{"type": "text", "data": text}]


def use_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Use a consumable item."""
    cid = _require_character(ctx)
    args = cmd.get("args", []) if cmd else []
    if not cid or not args:
        return [{"type": "text", "data": "Usage: use <item_id>"}]
    ok = item_svc.use_item(cid, args[0])
    text = "You use the item." if ok else "Item not available."
    return [{"type": "text", "data": text}] + inv(cmd, ctx)


def equip_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Equip an inventory item."""
    cid = _require_character(ctx)
    args = cmd.get("args", []) if cmd else []
    if not cid or not args:
        return [{"type": "text", "data": "Usage: equip <item_id>"}]
    ok = item_svc.equip_item(cid, args[0])
    text = "Equipped." if ok else "Item not found." 
    return [{"type": "text", "data": text}] + inv(cmd, ctx)


def unequip_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Unequip an item from a slot."""
    cid = _require_character(ctx)
    args = cmd.get("args", []) if cmd else []
    if not cid or not args:
        return [{"type": "text", "data": "Usage: unequip <slot>"}]
    try:
        slot = int(args[0])
    except ValueError:
        return [{"type": "text", "data": "Slot must be a number"}]
    ok = item_svc.unequip_slot(cid, slot)
    text = "Unequipped." if ok else "Nothing equipped there."
    return [{"type": "text", "data": text}] + inv(cmd, ctx)


def drop_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Placeholder drop command."""
    return [{"type": "text", "data": "Dropping items not yet implemented."}]


def take_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Placeholder take command."""
    return [{"type": "text", "data": "Taking items not yet implemented."}]


__all__ = [
    "inv",
    "inspect_cmd",
    "use_cmd",
    "equip_cmd",
    "unequip_cmd",
    "drop_cmd",
    "take_cmd",
]

