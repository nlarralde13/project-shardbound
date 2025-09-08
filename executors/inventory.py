from typing import Any, Dict, List
from api.models import CharacterItem, Item
from api.models.base import db


def _require_character(ctx: Dict[str, Any]) -> str | None:
    char = ctx.get("character") if ctx else None
    return getattr(char, "character_id", None) or getattr(char, "id", None)


def inv(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    cid = _require_character(ctx)
    if not cid:
        return [{"type": "text", "data": "No character"}]
    rows = (
        db.session.query(CharacterItem, Item)
        .outerjoin(Item, Item.item_id == CharacterItem.item_id)
        .filter(CharacterItem.character_id == cid)
        .order_by(CharacterItem.id.asc())
        .all()
    )
    data = [
        {
            "slot": ci.slot or "-",
            "item": itm.name if itm else ci.item_id,
            "qty": ci.quantity,
            "equipped": "yes" if ci.slot else "no",
        }
        for ci, itm in rows
    ]
    return [{"type": "table", "data": data}]


def inspect_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": "text", "data": "Not implemented."}]


def use_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": "text", "data": "Not implemented."}]


def equip_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": "text", "data": "Not implemented."}]


def unequip_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": "text", "data": "Not implemented."}]


def drop_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [{"type": "text", "data": "Dropping items not yet implemented."}]


def take_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
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
