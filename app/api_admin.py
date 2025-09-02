# app/api_admin.py
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from .models import db, User, Character, Item, ItemInstance, CharacterInventory, Town
from .security import admin_guard
from .security_rbac import (
    require_role,
    require_scopes,
    role_gte,
    has_scope,
    get_user_from_session,
    audit,
)

# Optional domains (won't error if models aren't present)
CraftingRecipe = None
Resource = None
try:
    from .models import CraftingRecipe as _CraftingRecipe  # type: ignore
    CraftingRecipe = _CraftingRecipe
except Exception:
    pass
try:
    from .models import Resource as _Resource  # type: ignore
    Resource = _Resource
except Exception:
    pass

admin_api = Blueprint("admin_api", __name__, url_prefix="/api/admin")

@admin_api.before_request
def _require_admin():
    # allow CORS preflight if needed
    if request.method == "OPTIONS":
        return
    admin_guard()

# -------- helpers ----------
def _pg():
    # default limit 50; cap at 500 to avoid accidents
    try: page = max(1, int(request.args.get("page", 1)))
    except: page = 1
    try: limit = int(request.args.get("limit", 50))
    except: limit = 50
    limit = max(1, min(limit, 500))
    offset = (page - 1) * limit
    return page, limit, offset

def _meta(total, page, limit):
    pages = (total + limit - 1) // limit if total else 1
    return {"total": int(total), "page": page, "limit": limit, "pages": int(max(1, pages))}

# ---------------- Users ----------------
@admin_api.get("/users")
def users_list():
    page, limit, offset = _pg()
    email = request.args.get("email")
    handle = request.args.get("handle")

    conds = []
    if email:  conds.append(User.email.ilike(f"%{email}%"))
    if handle: conds.append(User.handle.ilike(f"%{handle}%"))

    base = User.query.filter(*conds)
    total = base.count()

    sub = db.session.query(Character.user_id, func.count().label("nchars")).group_by(Character.user_id).subquery()
    rows = (
        db.session.query(User, func.coalesce(sub.c.nchars, 0).label("nchars"))
        .outerjoin(sub, sub.c.user_id == User.user_id)
        .filter(*conds)
        .order_by(User.created_at.asc())
        .limit(limit).offset(offset)
        .all()
    )
    data = []
    for u, nchars in rows:
        # fetch associated character names for each user
        char_names = [c.name for c in Character.query.with_entities(Character.name).filter_by(user_id=u.user_id).all()]
        data.append(dict(
            user_id=u.user_id,
            email=u.email,
            handle=u.handle,
            display_name=u.display_name,
            created_at=u.created_at.isoformat() if u.created_at else None,
            last_login_at=u.last_login_at.isoformat() if getattr(u, "last_login_at", None) else None,
            is_active=bool(getattr(u, "is_active", True)),
            selected_character_id=getattr(u, "selected_character_id", None),
            characters_count=int(nchars or 0),
            character_names=char_names,
        ))
    return jsonify(users=data, meta=_meta(total, page, limit))

@admin_api.get("/users/<user_id>")
def user_detail(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify(error="User not found"), 404
    chars = (Character.query
             .filter_by(user_id=u.user_id)
             .order_by(Character.created_at.asc())
             .all())
    payload = dict(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        created_at=u.created_at.isoformat() if u.created_at else None,
        last_login_at=u.last_login_at.isoformat() if getattr(u, "last_login_at", None) else None,
        is_active=bool(getattr(u, "is_active", True)),
        selected_character_id=getattr(u, "selected_character_id", None),
        characters=[dict(
            character_id=c.character_id, name=c.name, class_id=getattr(c, "class_id", None),
            level=getattr(c, "level", 1), is_active=bool(getattr(c, "is_active", True)),
            shard_id=getattr(c, "shard_id", None), x=getattr(c, "x", None), y=getattr(c, "y", None),
            created_at=c.created_at.isoformat() if c.created_at else None
        ) for c in chars]
    )
    return jsonify(payload)

@admin_api.post("/users")
def user_create():
    data = request.get_json() or {}
    email = data.get("email")
    if not email:
        return jsonify(error="email required"), 400
    u = User(
        email=email,
        handle=data.get("handle"),
        display_name=data.get("display_name"),
        is_active=data.get("is_active", True),
        selected_character_id=data.get("selected_character_id"),
    )
    db.session.add(u)
    db.session.commit()
    return jsonify(user_id=u.user_id), 201

@admin_api.patch("/users/<user_id>")
def user_update(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify(error="User not found"), 404
    data = request.get_json() or {}
    for field in ["email", "handle", "display_name", "is_active", "selected_character_id"]:
        if field in data:
            setattr(u, field, data[field])
    db.session.commit()
    return jsonify(status="updated")

@admin_api.delete("/users/<user_id>")
def user_delete(user_id):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify(error="User not found"), 404
    db.session.delete(u)
    db.session.commit()
    return jsonify(status="deleted")

# -------------- Characters --------------
@admin_api.get("/characters")
def characters_list():
    page, limit, offset = _pg()
    conds = []
    if (uid := request.args.get("user_id")): conds.append(Character.user_id == uid)
    if (email := request.args.get("email")):
        u = User.query.filter(User.email.ilike(email)).first()
        conds.append(Character.user_id == (u.user_id if u else None))
    if (name := request.args.get("name")): conds.append(Character.name.ilike(f"%{name}%"))
    if (active := request.args.get("active")):
        a = active.lower()
        if a in ("1","true","yes"):   conds.append(Character.is_active.is_(True))
        elif a in ("0","false","no"): conds.append((Character.is_active.is_(False)) | (Character.is_active == None))  # noqa: E711

    base = Character.query.filter(*conds)
    total = base.count()
    rows = (base.order_by(Character.created_at.asc()).limit(limit).offset(offset).all())
    data = [dict(
        character_id=c.character_id, name=c.name, class_id=getattr(c, "class_id", None),
        level=getattr(c, "level", 1), user_id=c.user_id,
        shard_id=getattr(c, "shard_id", None), x=getattr(c, "x", None), y=getattr(c, "y", None),
        is_active=bool(getattr(c, "is_active", True)),
        created_at=c.created_at.isoformat() if c.created_at else None
    ) for c in rows]
    return jsonify(characters=data, meta=_meta(total, page, limit))

@admin_api.get("/characters/<character_id>")
def character_detail(character_id):
    c = db.session.get(Character, character_id)
    if not c:
        return jsonify(error="Character not found"), 404

    inv_q = (db.session.query(
        CharacterInventory.slot_index, CharacterInventory.item_id, Item.name,
        CharacterInventory.instance_id, CharacterInventory.qty,
        CharacterInventory.equipped, CharacterInventory.acquired_at)
        .outerjoin(Item, Item.item_id == CharacterInventory.item_id)
        .filter(CharacterInventory.character_id == c.character_id)
        .order_by(CharacterInventory.slot_index.asc()))

    inventory = [dict(
        slot_index=r.slot_index, item_id=r.item_id, name=r.name or "(unknown)",
        instance_id=r.instance_id, qty=r.qty, equipped=bool(r.equipped),
        acquired_at=r.acquired_at.isoformat() if r.acquired_at else None
    ) for r in inv_q.all()]

    payload = dict(
        character_id=c.character_id, name=c.name, class_id=getattr(c, "class_id", None),
        level=getattr(c, "level", 1), user_id=c.user_id,
        shard_id=getattr(c, "shard_id", None), x=getattr(c, "x", None), y=getattr(c, "y", None),
        is_active=bool(getattr(c, "is_active", True)),
        created_at=c.created_at.isoformat() if c.created_at else None,
        inventory=inventory
    )
    return jsonify(payload)

@admin_api.post("/characters")
def character_create():
    data = request.get_json() or {}
    if not data.get("user_id") or not data.get("name"):
        return jsonify(error="user_id and name required"), 400
    c = Character(
        user_id=data["user_id"],
        name=data["name"],
        class_id=data.get("class_id"),
        level=data.get("level", 1),
        is_active=data.get("is_active", True),
        shard_id=data.get("shard_id"),
        x=data.get("x"),
        y=data.get("y"),
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(character_id=c.character_id), 201

@admin_api.patch("/characters/<character_id>")
def character_update(character_id):
    c = db.session.get(Character, character_id)
    if not c:
        return jsonify(error="Character not found"), 404
    data = request.get_json() or {}
    for field in ["name", "class_id", "level", "is_active", "shard_id", "x", "y"]:
        if field in data:
            setattr(c, field, data[field])
    db.session.commit()
    return jsonify(status="updated")

@admin_api.delete("/characters/<character_id>")
def character_delete(character_id):
    c = db.session.get(Character, character_id)
    if not c:
        return jsonify(error="Character not found"), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify(status="deleted")

# -------------- Items / Instances --------------
@admin_api.get("/items")
def items_list():
    page, limit, offset = _pg()
    conds = []
    if (s := request.args.get("id")): conds.append(Item.item_id.ilike(f"%{s}%"))
    if (s := request.args.get("name")): conds.append(Item.name.ilike(f"%{s}%"))
    if (s := request.args.get("type")): conds.append(Item.type.ilike(s))
    if (s := request.args.get("rarity")): conds.append(Item.rarity.ilike(s))

    base = Item.query.filter(*conds)
    total = base.count()
    rows = base.order_by(Item.item_id.asc()).limit(limit).offset(offset).all()
    data = [dict(item_id=i.item_id, item_version=i.item_version, name=i.name, type=i.type,
                 rarity=i.rarity, stack_size=i.stack_size, base_stats=i.base_stats) for i in rows]
    return jsonify(items=data, meta=_meta(total, page, limit))

@admin_api.get("/items/<item_id>")
def item_detail(item_id):
    i = db.session.get(Item, item_id)
    if not i:
        return jsonify(error="Item not found"), 404
    return jsonify(dict(
        item_id=i.item_id,
        item_version=i.item_version,
        name=i.name,
        type=i.type,
        rarity=i.rarity,
        stack_size=i.stack_size,
        base_stats=i.base_stats,
    ))

@admin_api.post("/items")
def item_create():
    data = request.get_json() or {}
    required = ["item_id", "item_version", "name", "type", "rarity"]
    if not all(k in data for k in required):
        return jsonify(error="missing required fields"), 400
    i = Item(
        item_id=data["item_id"],
        item_version=data["item_version"],
        name=data["name"],
        type=data["type"],
        rarity=data["rarity"],
        stack_size=data.get("stack_size", 1),
        base_stats=data.get("base_stats", {}),
    )
    db.session.add(i)
    db.session.commit()
    return jsonify(item_id=i.item_id), 201

@admin_api.patch("/items/<item_id>")
def item_update(item_id):
    i = db.session.get(Item, item_id)
    if not i:
        return jsonify(error="Item not found"), 404
    data = request.get_json() or {}
    for field in ["item_version", "name", "type", "rarity", "stack_size", "base_stats"]:
        if field in data:
            setattr(i, field, data[field])
    db.session.commit()
    return jsonify(status="updated")

@admin_api.delete("/items/<item_id>")
def item_delete(item_id):
    i = db.session.get(Item, item_id)
    if not i:
        return jsonify(error="Item not found"), 404
    db.session.delete(i)
    db.session.commit()
    return jsonify(status="deleted")

@admin_api.get("/item_instances")
def instances_list():
    page, limit, offset = _pg()
    base = ItemInstance.query
    if (iid := request.args.get("item_id")): base = base.filter(ItemInstance.item_id == iid)
    total = base.count()
    rows = base.order_by(ItemInstance.instance_id.asc()).limit(limit).offset(offset).all()
    data = [dict(instance_id=i.instance_id, item_id=i.item_id, item_version=i.item_version, quantity=i.quantity) for i in rows]
    return jsonify(instances=data, meta=_meta(total, page, limit))

@admin_api.get("/characters/<character_id>/inventory")
def inventory_list(character_id):
    page, limit, offset = _pg()
    c = db.session.get(Character, character_id)
    if not c: return jsonify(error="Character not found"), 404
    q = (db.session.query(
            CharacterInventory.slot_index, CharacterInventory.item_id, Item.name,
            CharacterInventory.instance_id, CharacterInventory.qty, CharacterInventory.equipped, CharacterInventory.acquired_at)
        .outerjoin(Item, Item.item_id == CharacterInventory.item_id)
        .filter(CharacterInventory.character_id == character_id)
        .order_by(CharacterInventory.slot_index.asc()))
    total = q.count()
    rows = q.limit(limit).offset(offset).all()
    data = [dict(slot_index=r.slot_index, item_id=r.item_id, name=r.name or "(unknown)",
                 instance_id=r.instance_id, qty=r.qty, equipped=bool(r.equipped),
                 acquired_at=(r.acquired_at.isoformat() if r.acquired_at else None)) for r in rows]
    return jsonify(inventory=data, meta=_meta(total, page, limit))

# -------------- Recipes (optional) --------------
@admin_api.get("/recipes")
def recipes_list():
    if CraftingRecipe is None:
        return jsonify(enabled=False, reason="CraftingRecipe model not found"), 501
    page, limit, offset = _pg()
    base = CraftingRecipe.query
    if (s := request.args.get("id")): base = base.filter(CraftingRecipe.recipe_id.ilike(f"%{s}%"))
    if (s := request.args.get("name")): base = base.filter(CraftingRecipe.name.ilike(f"%{s}%"))
    if (s := request.args.get("produces_item_id")): base = base.filter(CraftingRecipe.produces_item_id == s)
    total = base.count()
    rows = base.order_by(CraftingRecipe.recipe_id.asc()).limit(limit).offset(offset).all()
    data = [dict(
        recipe_id=r.recipe_id, name=r.name,
        produces_item_id=getattr(r, "produces_item_id", None),
        time_seconds=getattr(r, "time_seconds", None),
        station=getattr(r, "station", None),
        inputs=getattr(r, "inputs", None),
        outputs=getattr(r, "outputs", None),
    ) for r in rows]
    return jsonify(recipes=data, enabled=True, meta=_meta(total, page, limit))

# -------------- Resources (optional) --------------
@admin_api.get("/resources")
def resources_list():
    if Resource is None:
        return jsonify(enabled=False, reason="Resource model not found"), 501
    page, limit, offset = _pg()
    base = Resource.query
    if (s := request.args.get("id")): base = base.filter(Resource.resource_id.ilike(f"%{s}%"))
    if (s := request.args.get("name")): base = base.filter(Resource.name.ilike(f"%{s}%"))
    if (s := request.args.get("type")): base = base.filter(Resource.type.ilike(s))
    if (s := request.args.get("rarity")): base = base.filter(Resource.rarity.ilike(s))
    total = base.count()
    rows = base.order_by(Resource.resource_id.asc()).limit(limit).offset(offset).all()
    data = [dict(
        resource_id=r.resource_id, name=r.name, type=getattr(r, "type", None),
        rarity=getattr(r, "rarity", None), biome=getattr(r, "biome", None),
        yield_min=getattr(r, "yield_min", None), yield_max=getattr(r, "yield_max", None),
        meta=getattr(r, "meta", None)
    ) for r in rows]
    return jsonify(resources=data, enabled=True, meta=_meta(total, page, limit))


# -------------- Teleport / Move --------------


def _resolve_coords(ch: Character, body: dict):
    if body.get("snap_to_spawn") and ch.first_time_spawn:
        return ch.first_time_spawn
    if body.get("town_id"):
        town = db.session.get(Town, body["town_id"])
        if town:
            return {"x": town.x + town.width // 2, "y": town.y + town.height // 2}
    x = body.get("x")
    y = body.get("y")
    if x is None or y is None:
        raise ValueError("x,y required")
    return {"x": int(x), "y": int(y)}


@admin_api.post("/characters/<character_id>/teleport")
@require_role("user")
def admin_char_teleport(character_id):
    u = get_user_from_session()
    if not (role_gte(getattr(u, "role", "user"), "gm") or has_scope(u, "char.move")):
        return jsonify(error="forbidden"), 403
    body = request.get_json() or {}
    ch = db.session.get(Character, character_id)
    if not ch:
        return jsonify(error="not_found"), 404
    try:
        coords = _resolve_coords(ch, body)
    except Exception:
        return jsonify(error="x,y required (ints)"), 400
    ch.last_coords = coords
    if hasattr(ch, "x"):
        ch.x = coords["x"]
    if hasattr(ch, "y"):
        ch.y = coords["y"]
    ch.cur_loc = f"{coords['x']},{coords['y']}"
    db.session.commit()
    audit("char.teleport", "character", character_id, payload={"coords": coords, "note": body.get("note")})
    payload = {
        "character_id": ch.character_id,
        "first_time_spawn": ch.first_time_spawn,
        "last_coords": ch.last_coords,
        "x": getattr(ch, "x", None),
        "y": getattr(ch, "y", None),
        "cur_loc": ch.cur_loc,
    }
    return jsonify(payload)


# -------------- Console Exec --------------


@admin_api.post("/console/exec")
@require_role("moderator")
def admin_console_exec():
    from .admin_console import dispatch

    body = request.get_json() or {}
    cmd = (body.get("command") or "").strip()
    dry = bool(body.get("dry_run"))
    out, data, status = dispatch(cmd, dry_run=dry)
    if status == 200:
        audit("console.exec", payload={"cmd": cmd, "dry": dry})
        return jsonify(ok=True, output=out, data=data)
    return jsonify(error=out), status
