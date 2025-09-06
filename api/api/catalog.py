from __future__ import annotations

import re
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

from api.models import db
from api.models.items import Item
from api.models.inventory_v2 import StarterLoadout


bp = Blueprint("catalog_api", __name__, url_prefix="/api")


def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return re.sub(r"-+", "-", s) or "item"


_DICE_RE = re.compile(r"^\d+d\d+(?:[+-]\d+)?$")


def _validate_effects(obj: dict) -> tuple[bool, str | None]:
    if not obj:
        return True, None
    # Very light schema: allow keys like heal, damage with dice strings
    for k, v in obj.items():
        if isinstance(v, str):
            if not _DICE_RE.match(v):
                return False, f"effect '{k}' must be dice string like '1d4'"
        elif isinstance(v, (int, float, bool)):
            continue
        elif isinstance(v, dict):
            ok, err = _validate_effects(v)
            if not ok:
                return ok, err
        else:
            return False, f"effect '{k}' has unsupported type"
    return True, None


def _item_to_json(i: Item) -> dict:
    return {
        "slug": i.slug,
        "name": i.name,
        "type": i.type,
        "slot": i.slot,
        "icon_path": i.icon_path,
        "stackable": bool(i.stackable) if i.stackable is not None else None,
        "max_stack": i.max_stack,
        "stats": i.stats or i.base_stats or {},
        "on_use": i.on_use,
        "on_equip": i.on_equip,
        "tags": i.tags,
    }


@bp.post("/items")
def create_item():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name is required"), 400
    slug = (data.get("slug") or slugify(name))
    # uniqueness checks
    if Item.query.filter(Item.slug == slug).first():
        return jsonify(error="slug already exists"), 400
    catalog_no = (data.get("catalog_no") or None)
    if catalog_no and Item.query.filter(Item.catalog_no == catalog_no).first():
        return jsonify(error="catalog_no already exists"), 400

    # validate effects
    for field in ("on_use", "on_equip"):
        ok, err = _validate_effects(data.get(field) or {})
        if not ok:
            return jsonify(error=err), 400

    # derive an item_id if not provided to fit existing PK
    item_id = data.get("item_id") or f"itm_{slug}"
    itm = Item(
        item_id=item_id,
        item_version=str(data.get("item_version") or "1"),
        name=name,
        type=(data.get("type") or "misc"),
        rarity=(data.get("rarity") or "common"),
        stack_size=int(data.get("stack_size") or data.get("max_stack") or 1),
        base_stats=data.get("base_stats") or {},
        slug=slug,
        catalog_no=catalog_no,
        description=data.get("description"),
        slot=data.get("slot"),
        stackable=bool(data.get("stackable")) if data.get("stackable") is not None else None,
        max_stack=int(data.get("max_stack")) if data.get("max_stack") is not None else None,
        level_req=int(data.get("level_req") or 1),
        icon_path=data.get("icon_path"),
        weight=float(data.get("weight")) if data.get("weight") is not None else None,
        value=int(data.get("value")) if data.get("value") is not None else None,
        stats=data.get("stats") or None,
        on_use=data.get("on_use") or None,
        on_equip=data.get("on_equip") or None,
        tags=data.get("tags") or None,
    )
    db.session.add(itm)
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error="integrity error", detail=str(e)), 400
    return jsonify(_item_to_json(itm)), 201


@bp.patch("/items/<slug>")
def update_item(slug: str):
    itm = Item.query.filter(Item.slug == slug).first()
    if not itm:
        return jsonify(error="not found"), 404
    data = (request.get_json(force=True, silent=True) or {})
    # Do not allow slug change here to keep references stable
    if "name" in data:
        v = (data.get("name") or "").strip()
        if v:
            itm.name = v
    for field in [
        "type", "rarity", "description", "slot", "icon_path",
    ]:
        if field in data:
            setattr(itm, field, data.get(field))
    for field in ["stack_size", "max_stack", "level_req", "value", "weight"]:
        if field in data and data.get(field) is not None:
            try:
                setattr(itm, field, int(data.get(field)))
            except Exception:
                try:
                    setattr(itm, field, float(data.get(field)))
                except Exception:
                    pass
    if "stackable" in data:
        itm.stackable = bool(data.get("stackable"))
    for jf in ("stats", "on_use", "on_equip", "tags"):
        if jf in data:
            if jf in ("on_use", "on_equip"):
                ok, err = _validate_effects(data.get(jf) or {})
                if not ok:
                    return jsonify(error=err), 400
            setattr(itm, jf, data.get(jf))
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error="integrity error", detail=str(e)), 400
    return jsonify(_item_to_json(itm))


@bp.get("/items")
def list_items():
    q = Item.query
    t = request.args.get("type")
    if t:
        q = q.filter(Item.type == t)
    slug = request.args.get("slug")
    if slug:
        q = q.filter(Item.slug == slug)
    tag = request.args.get("tag")
    if tag:
        # tags stored as JSON array; use LIKE fallback for sqlite
        q = q.filter(Item.tags.like(f"%\"{tag}\"%"))
    rows = q.order_by(Item.slug.asc().nullslast()).all()
    return jsonify([_item_to_json(i) for i in rows])


@bp.get("/starter-loadouts")
def get_starter_loadouts():
    cls = (request.args.get("class") or request.args.get("class_id") or "").strip().lower()
    try:
        lvl = int(request.args.get("level") or 1)
    except Exception:
        lvl = 1
    if not cls:
        return jsonify(error="class is required"), 400
    # Find loadout entries that cover this level
    rows = (
        StarterLoadout.query
        .filter(StarterLoadout.class_name == cls)
        .filter(StarterLoadout.level_min <= lvl, StarterLoadout.level_max >= lvl)
        .all()
    )
    # Resolve slugs
    item_map = {i.item_id: i for i in Item.query.filter(Item.item_id.in_([r.item_id for r in rows])).all()}
    out = []
    for r in rows:
        it = item_map.get(r.item_id)
        out.append({"slug": (it.slug if it else None), "quantity": r.quantity})
    return jsonify(out)

