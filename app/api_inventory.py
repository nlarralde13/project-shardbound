"""Simple inventory API used by the demo UI.

Routes live under ``/api`` and work with the ``Item`` and ``InventoryItem``
models defined for this prototype.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import case

from .models.base import db
from .models.characters import Character
from .models.item import Item  # v1 items (items_v1)
from .models.inventory_item import InventoryItem  # v1 inventory rows
from .models.items import Item as ItemV2  # v2 items (items)
from .models.inventory_v2 import CharacterItem  # v2 character items


bp = Blueprint("inventory_api", __name__, url_prefix="/api")

# rarity order for sorting; earlier in list = more common
RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]


def _serialize_inventory(rows):
    """Turn joined ``InventoryItem`` rows into JSON serializable dicts."""
    items = []
    for row in rows:
        itm = row.item
        items.append(
            {
                "item_id": itm.id,
                "slug": itm.slug,
                "display_name": itm.display_name,
                "icon_url": itm.icon_url,
                "quantity": row.quantity,
                "stackable": itm.stackable,
                "max_stack": itm.max_stack,
                "rarity": itm.rarity,
                "description": itm.description,
            }
        )
    return items


def _serialize_inventory_v2(rows):
    """Turn (CharacterItem, ItemV2) tuples into the unified JSON shape."""
    out = []
    for ci, itm in rows:
        data = {
                "item_id": getattr(itm, "item_id", None),
                "slug": getattr(itm, "slug", None),
                "display_name": getattr(itm, "name", None) or getattr(itm, "slug", ""),
                "icon_url": getattr(itm, "icon_path", None) or getattr(itm, "icon_url", None),
                "quantity": getattr(ci, "quantity", 1),
                "stackable": getattr(itm, "stackable", True),
                "max_stack": getattr(itm, "max_stack", None) or getattr(itm, "stack_size", None) or 99,
                "rarity": getattr(itm, "rarity", "common"),
                "description": getattr(itm, "description", None),
                "slot": getattr(ci, "slot", None),
            }
        data["equipped"] = bool(data.get("slot"))
        out.append(data)
    return out


def _rarity_sort():
    """Return a SQLAlchemy CASE expression for rarity ordering."""
    return case({r: i for i, r in enumerate(RARITY_ORDER)}, value=Item.rarity)


@bp.get("/characters/<character_id>/inventory")
def get_inventory(character_id: str):
    """Return the character's inventory in JSON form (v2 standard).

    Uses v2 tables (character_items + items) to avoid version skew.
    """
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error="Character not found"), 404

    # v2 rows only (standardize on v2)
    rows_v2 = (
        db.session.query(CharacterItem, ItemV2)
        .join(ItemV2, CharacterItem.item_id == ItemV2.item_id)
        .filter(CharacterItem.character_id == character_id)
        .all()
    )
    merged = _serialize_inventory_v2(rows_v2)
    def keyfn(it):
        r = it.get("rarity") or "common"
        name = it.get("display_name") or it.get("slug") or ""
        try:
            ri = RARITY_ORDER.index(r)
        except ValueError:
            ri = len(RARITY_ORDER)
        return (ri, name)

    merged.sort(key=keyfn)
    return jsonify({"character_id": character_id, "items": merged})


@bp.post("/characters/<character_id>/inventory/add")
def add_item(character_id: str):
    """Give the character more of an item."""
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error="Character not found"), 404

    data = request.get_json(force=True, silent=True) or {}
    slug = data.get("item_slug")
    qty = int(data.get("quantity", 1))

    item = Item.query.filter_by(slug=slug).first()
    if not item:
        return jsonify(error="item_slug not found"), 400

    entry = InventoryItem.query.filter_by(
        character_id=character_id, item_id=item.id
    ).first()

    capped = False
    if item.stackable:
        new_qty = qty
        if entry:
            new_qty += entry.quantity
        if new_qty > item.max_stack:
            new_qty = item.max_stack
            capped = True
        if entry:
            entry.quantity = new_qty
        else:
            entry = InventoryItem(
                character_id=character_id, item_id=item.id, quantity=new_qty
            )
            db.session.add(entry)
    else:
        if entry:
            entry.quantity = 1
        else:
            entry = InventoryItem(
                character_id=character_id, item_id=item.id, quantity=1
            )
            db.session.add(entry)

    db.session.commit()

    payload = {
        "character_id": character_id,
        "items": _serialize_inventory(
            InventoryItem.query.join(Item)
            .filter(InventoryItem.character_id == character_id)
            .order_by(_rarity_sort(), Item.display_name)
            .all()
        ),
    }
    if capped:
        payload["capped"] = True
    return jsonify(payload)


@bp.post("/characters/<character_id>/inventory/remove")
def remove_item(character_id: str):
    """Remove quantity of an item from the character."""
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error="Character not found"), 404

    data = request.get_json(force=True, silent=True) or {}
    slug = data.get("item_slug")
    qty = int(data.get("quantity", 1))

    item = Item.query.filter_by(slug=slug).first()
    if not item:
        return jsonify(error="item_slug not found"), 400

    entry = InventoryItem.query.filter_by(
        character_id=character_id, item_id=item.id
    ).first()
    if not entry:
        return jsonify(error="Item not in inventory"), 400

    entry.quantity -= qty
    if entry.quantity <= 0:
        db.session.delete(entry)

    db.session.commit()

    rows = (
        InventoryItem.query.join(Item)
        .filter(InventoryItem.character_id == character_id)
        .order_by(_rarity_sort(), Item.display_name)
        .all()
    )
    return jsonify({"character_id": character_id, "items": _serialize_inventory(rows)})

