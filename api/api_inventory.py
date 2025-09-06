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


# ---------------------- Equipment (v2) ----------------------

def _refresh_inventory_v2(character_id: str):
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
    return merged


def _slot_norm(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip().lower().replace('_', '')
    # normalize a few aliases
    if s == 'main_hand': s = 'mainhand'
    if s == 'off_hand': s = 'offhand'
    return s


@bp.post("/characters/<character_id>/equip")
def equip_item_v2(character_id: str):
    """Equip an item into a given slot (v2 semantics).

    Body: { character_item_id?: int, slug?: str, slot: str, replace?: bool }

    - If the source row is stackable and quantity > 1, decrement source and
      create a new CharacterItem row with quantity=1 in the target slot.
    - If non-stackable or qty==1, update source row's slot.
    - Enforce two-hand/shield constraints using Item.tags and current equipment.
    """
    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error="Character not found"), 404

    data = request.get_json(force=True, silent=True) or {}
    slot = _slot_norm(data.get("slot"))
    if not slot:
        return jsonify(error="slot is required"), 400

    # resolve source item
    ci: CharacterItem | None = None
    src_id = data.get("character_item_id") or data.get("id")
    if src_id is not None:
        try:
            ci = db.session.get(CharacterItem, int(src_id))
        except Exception:
            ci = None
        if not ci or ci.character_id != character_id:
            return jsonify(error="character_item not found"), 404
        itm = db.session.query(ItemV2).filter(ItemV2.item_id == ci.item_id).first()
    else:
        slug = (data.get("slug") or data.get("item_slug") or "").strip()
        if not slug:
            return jsonify(error="slug or character_item_id required"), 400
        itm = db.session.query(ItemV2).filter(ItemV2.slug == slug).first()
        if not itm:
            return jsonify(error="item not found"), 404
        # pick a row for this item
        ci = (
            db.session.query(CharacterItem)
            .filter(CharacterItem.character_id == character_id, CharacterItem.item_id == itm.item_id)
            .order_by(CharacterItem.quantity.desc())
            .first()
        )
        if not ci:
            return jsonify(error="item not in inventory"), 400

    # Validate slot compatibility
    allowed_slot = (itm.slot or "").lower().replace('_', '')
    if allowed_slot and slot not in (allowed_slot,):
        # allow one-handed weapons to be placed in offhand if tagged dual_wield_ok
        tags = (itm.tags or []) if isinstance(itm.tags, list) else []
        if not (allowed_slot == 'mainhand' and slot == 'offhand' and ('dual_wield_ok' in tags or 'dualwieldok' in tags)):
            return jsonify(error="incompatible_slot", message=f"{itm.name or itm.slug} cannot be equipped to {slot}"), 400

    # Check hand constraints
    def equipped_in(s):
        return (
            db.session.query(CharacterItem, ItemV2)
            .join(ItemV2, CharacterItem.item_id == ItemV2.item_id)
            .filter(CharacterItem.character_id == character_id, CharacterItem.slot == s)
            .first()
        )

    two_handed = False
    tags = (itm.tags or []) if isinstance(itm.tags, list) else []
    for t in tags:
        if isinstance(t, str) and t.replace('-', '').replace('_', '').lower() == 'twohanded':
            two_handed = True
            break

    # if equipping a two-handed weapon into mainhand, offhand must be free
    if slot == 'mainhand' and two_handed:
        if equipped_in('offhand'):
            return jsonify(code="blocked", reason="offhand_occupied", message="Two-handed weapons require both hands free."), 400

    # if a shield is equipped and we're trying to equip a two-handed into mainhand -> block
    off = equipped_in('offhand')
    if slot == 'mainhand' and two_handed and off and (off[1].type == 'shield' or (off[1].tags or [] and 'shield' in (off[1].tags or []))):
        return jsonify(code="blocked", reason="offhand_occupied", message="Two-handed weapons require both hands free."), 400

    # if equipping to offhand and mainhand holds a two-handed weapon -> block
    if slot == 'offhand':
        mh = equipped_in('mainhand')
        if mh:
            mh_tags = (mh[1].tags or []) if isinstance(mh[1].tags, list) else []
            is_two_handed = any((isinstance(t, str) and t.replace('-', '').replace('_', '').lower() == 'twohanded') for t in mh_tags)
            if is_two_handed:
                return jsonify(code="blocked", reason="offhand_occupied", message="Two-handed weapons require both hands free."), 400

    # If target occupied
    target = equipped_in(slot)
    replace = bool(data.get('replace'))
    if target and not replace:
        return jsonify(code="occupied", message="Slot is occupied"), 409
    if target and replace:
        target_ci = target[0]
        target_ci.slot = None
        # merge if same item_id & stackable
        if target_ci.item_id == ci.item_id:
            # merge into source stack if possible
            src = (
                db.session.query(CharacterItem)
                .filter(CharacterItem.character_id == character_id, CharacterItem.item_id == target_ci.item_id, CharacterItem.slot.is_(None))
                .first()
            )
            if src and (itm.stackable or itm.max_stack):
                src.quantity = int(src.quantity or 0) + int(target_ci.quantity or 1)
                db.session.delete(target_ci)

    # Perform equip
    if (itm.stackable or (itm.max_stack and itm.max_stack > 1)) and int(ci.quantity or 1) > 1:
        # decrement source, create new equipped row
        ci.quantity = int(ci.quantity) - 1
        new_ci = CharacterItem(character_id=character_id, item_id=ci.item_id, quantity=1, slot=slot, bound=bool(ci.bound))
        db.session.add(new_ci)
    else:
        # move this row into the slot
        ci.slot = slot

    db.session.commit()
    return jsonify({ "character_id": character_id, "items": _refresh_inventory_v2(character_id) })


@bp.post("/characters/<character_id>/unequip")
def unequip_item_v2(character_id: str):
    data = request.get_json(force=True, silent=True) or {}
    slot = _slot_norm(data.get('slot'))
    if not slot:
        return jsonify(error="slot is required"), 400
    row = db.session.query(CharacterItem, ItemV2).join(ItemV2, CharacterItem.item_id == ItemV2.item_id).\
        filter(CharacterItem.character_id == character_id, CharacterItem.slot == slot).first()
    if not row:
        return jsonify(error="not_found"), 404
    ci, itm = row

    # merge into existing stack if stackable
    if (itm.stackable or (itm.max_stack and itm.max_stack > 1)):
        home = (
            db.session.query(CharacterItem)
            .filter(CharacterItem.character_id == character_id, CharacterItem.item_id == ci.item_id, CharacterItem.slot.is_(None))
            .first()
        )
        if home:
            home.quantity = int(home.quantity or 0) + int(ci.quantity or 1)
            db.session.delete(ci)
        else:
            ci.slot = None
    else:
        ci.slot = None

    db.session.commit()
    return jsonify({ "character_id": character_id, "items": _refresh_inventory_v2(character_id) })


@bp.get("/characters/<character_id>/equipment")
def get_equipment_v2(character_id: str):
    rows = (
        db.session.query(CharacterItem, ItemV2)
        .join(ItemV2, CharacterItem.item_id == ItemV2.item_id)
        .filter(CharacterItem.character_id == character_id, CharacterItem.slot.isnot(None))
        .all()
    )
    out = {}
    for ci, itm in rows:
        out[ci.slot] = {
            'slug': itm.slug,
            'name': itm.name,
            'icon_path': itm.icon_path,
            'slot': ci.slot,
            'quantity': ci.quantity,
        }
    return jsonify(out)

