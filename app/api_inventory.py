"""Simple inventory API used by the demo UI.

Routes live under ``/api`` and work with the ``Item`` and ``InventoryItem``
models defined for this prototype.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import case

from .models.base import db
from .models.characters import Character
from .models.item import Item
from .models.inventory_item import InventoryItem


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


def _rarity_sort():
    """Return a SQLAlchemy CASE expression for rarity ordering."""
    return case({r: i for i, r in enumerate(RARITY_ORDER)}, value=Item.rarity)


@bp.get("/characters/<character_id>/inventory")
def get_inventory(character_id: str):
    """Return the character's inventory in JSON form."""
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error="Character not found"), 404

    rows = (
        InventoryItem.query.join(Item)
        .filter(InventoryItem.character_id == character_id)
        .order_by(_rarity_sort(), Item.display_name)
        .all()
    )
    return jsonify({"character_id": character_id, "items": _serialize_inventory(rows)})


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

