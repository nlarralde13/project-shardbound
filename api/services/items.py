"""Item and inventory helpers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from api.models import db, Item, CharacterInventory


def get_character_inventory(character_id: str) -> List[Dict[str, Any]]:
    """Return inventory rows for a character."""
    rows = (
        CharacterInventory.query.filter_by(character_id=character_id)
        .order_by(CharacterInventory.slot_index.asc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    for r in rows:
        item = db.session.get(Item, r.item_id) if r.item_id else None
        out.append(
            {
                "slot": r.slot_index,
                "item_id": r.item_id,
                "name": item.name if item else r.item_id,
                "qty": r.qty,
                "equipped": bool(r.equipped),
            }
        )
    return out


def inspect_item(item_id: str) -> Optional[Dict[str, Any]]:
    """Return item info by ``item_id``."""
    item = db.session.get(Item, item_id)
    if not item:
        return None
    return {
        "item_id": item.item_id,
        "name": item.name,
        "type": item.type,
        "rarity": item.rarity,
    }


def use_item(character_id: str, item_id: str, qty: int = 1) -> bool:
    """Consume ``qty`` of ``item_id`` from character's inventory."""
    row = CharacterInventory.query.filter_by(character_id=character_id, item_id=item_id).first()
    if not row or row.qty < qty:
        return False
    row.qty -= qty
    if row.qty <= 0:
        db.session.delete(row)
    db.session.commit()
    return True


def equip_item(character_id: str, item_id: str) -> bool:
    """Mark an inventory row as equipped."""
    row = CharacterInventory.query.filter_by(character_id=character_id, item_id=item_id).first()
    if not row:
        return False
    row.equipped = True
    db.session.commit()
    return True


def unequip_slot(character_id: str, slot_index: int) -> bool:
    """Unset the equipped flag for a slot."""
    row = CharacterInventory.query.filter_by(character_id=character_id, slot_index=slot_index).first()
    if not row or not row.equipped:
        return False
    row.equipped = False
    db.session.commit()
    return True


__all__ = [
    "get_character_inventory",
    "inspect_item",
    "use_item",
    "equip_item",
    "unequip_slot",
]

