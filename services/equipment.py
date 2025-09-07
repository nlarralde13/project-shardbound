import logging
from typing import Dict, Any
from sqlalchemy.orm import joinedload

from api.models import (
    db,
    Character,
    ItemInstance,
    Item,
    CharacterItem,
    CharacterEquipped,
    EQUIP_SLOTS,
)
from .derived_stats import build_snapshot

logger = logging.getLogger(__name__)

class EquipError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def get_loadout(character_id: str) -> Dict[str, Any]:
    char = (
        Character.query.options(
            joinedload(Character.equipped_items).joinedload(CharacterEquipped.item_instance)
        ).get(character_id)
    )
    if not char:
        return {}
    equipped: Dict[str, Any] = {}
    for ce in char.equipped_items:
        tmpl = Item.query.get(ce.item_instance.item_id) if ce.item_instance else None
        equipped[ce.slot] = {
            "item_instance_id": ce.item_instance_id,
            "template_id": ce.item_instance.item_id if ce.item_instance else None,
            "name": tmpl.name if tmpl else None,
        }
    inventory = []
    rows = CharacterItem.query.filter_by(character_id=character_id).all()
    for row in rows:
        itm = Item.query.get(row.item_id)
        inventory.append({
            "item_instance_id": None,
            "template_id": row.item_id,
            "name": itm.name if itm else None,
            "qty": row.quantity,
        })
    return {
        "equipped": equipped,
        "inventory": inventory,
        "derived_stats": (char.combat_snapshot or {}).get("stats", {}),
    }


def equip_item(*, character_id: str, item_instance_id: str, slot: str) -> Dict[str, Any]:
    if slot not in EQUIP_SLOTS:
        raise EquipError("E_SLOT_INVALID", "Invalid slot")
    try:
        char = Character.query.get(character_id)
        if not char:
            raise EquipError("E_NO_CHAR", "Character not found")
        inst = ItemInstance.query.get(item_instance_id)
        if not inst:
            raise EquipError("E_NO_ITEM", "Item instance not found")
        owned = CharacterItem.query.filter_by(character_id=character_id, item_id=inst.item_id).first()
        if not owned:
            raise EquipError("E_NOT_OWNER", "Character does not own item")
        tmpl = Item.query.get(inst.item_id)
        allowed = getattr(tmpl, "allowed_slots", None) or ([tmpl.slot] if getattr(tmpl, "slot", None) else [])
        if allowed and slot not in allowed:
            raise EquipError("E_SLOT_INVALID", "Item not allowed in slot")
        prev = CharacterEquipped.query.filter_by(character_id=character_id, slot=slot).first()
        replaced_id = None
        if prev:
            replaced_id = prev.item_instance_id
            db.session.delete(prev)
        other = CharacterEquipped.query.filter_by(item_instance_id=item_instance_id).first()
        if other:
            db.session.delete(other)
        ce = CharacterEquipped(character_id=character_id, slot=slot, item_instance_id=item_instance_id)
        db.session.add(ce)
        snapshot = build_snapshot(character_id)
        char.combat_snapshot = snapshot
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    logger.info(
        "equip_item character_id=%s slot=%s new_item_instance_id=%s replaced_item_instance_id=%s",
        character_id,
        slot,
        item_instance_id,
        replaced_id,
    )
    return get_loadout(character_id)


def unequip_slot(*, character_id: str, slot: str) -> Dict[str, Any]:
    if slot not in EQUIP_SLOTS:
        raise EquipError("E_SLOT_INVALID", "Invalid slot")
    try:
        char = Character.query.get(character_id)
        if not char:
            raise EquipError("E_NO_CHAR", "Character not found")
        prev = CharacterEquipped.query.filter_by(character_id=character_id, slot=slot).first()
        removed_id = None
        if prev:
            removed_id = prev.item_instance_id
            db.session.delete(prev)
        snapshot = build_snapshot(character_id)
        char.combat_snapshot = snapshot
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    logger.info(
        "unequip_slot character_id=%s slot=%s removed_item_instance_id=%s",
        character_id,
        slot,
        removed_id,
    )
    return get_loadout(character_id)
