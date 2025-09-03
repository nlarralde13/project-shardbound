# db_cli.py — Shardbound DB CLI (drop-in replacement)
import os, sys, json, argparse, datetime
from typing import Optional, List

# Ensure local package import works when running directly
sys.path.insert(0, os.path.abspath("."))

# Make sure dev bootstrap doesn't fight migrations
os.environ.setdefault("AUTO_CREATE_TABLES", "0")

import sqlalchemy as sa  # type: ignore

# App + models
from app import create_app  # type: ignore
from app.models import db, User, Character  # type: ignore
try:
    from app.models import Item, ItemInstance, CharacterInventory  # type: ignore
except Exception:
    Item = ItemInstance = CharacterInventory = None  # type: ignore

ALLOWED_ROLES = ["user","moderator","gm","admin","dev"]

def _fmt_dt(dt):
    if not dt: return None
    if isinstance(dt, (datetime.datetime, datetime.date)):
        return dt.isoformat()
    return str(dt)

def print_rows(rows: List[tuple], headers: List[str]) -> None:
    if not rows:
        print("(no rows)")
        return
    widths = [len(h) for h in headers]
    for r in rows:
        for i, v in enumerate(r):
            widths[i] = max(widths[i], len("" if v is None else str(v)))
    line = " | ".join(h.ljust(widths[i]) for i,h in enumerate(headers))
    print(line)
    print("-+-".join("-"*w for w in widths))
    for r in rows:
        print(" | ".join(("" if v is None else str(v)).ljust(widths[i]) for i,v in enumerate(r)))

def _scopes_to_list(val) -> List[str]:
    if val is None: return []
    if isinstance(val, list): return val
    if isinstance(val, (bytes, bytearray)): 
        val = val.decode("utf-8", "ignore")
    if isinstance(val, str):
        s = val.strip()
        if s.startswith("["):
            try: return json.loads(s)
            except Exception: return []
        return [t.strip() for t in s.split(",") if t.strip()]
    return []

# --------------------
# Seed + Export helpers
# --------------------

def _slugify(name: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return re.sub(r"-+", "-", s) or "item"


def cmd_seed_items(args):
    from app.models.items import Item
    from app.models.inventory_v2 import StarterLoadout
    path = args.file
    if not os.path.exists(path):
        print(f"Seed file not found: {path}")
        return
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    items = payload.get("items") or []
    loadout = payload.get("loadout") or {}

    created = 0
    updated = 0
    for spec in items:
        slug = spec.get("slug") or _slugify(spec.get("name") or "")
        itm = Item.query.filter_by(slug=slug).first()
        if not itm:
            itm = Item(
                item_id=spec.get("item_id") or f"itm_{slug}",
                item_version=str(spec.get("item_version") or "1"),
                name=spec.get("name") or slug,
                type=spec.get("type") or "misc",
                rarity=spec.get("rarity") or "common",
                stack_size=int(spec.get("max_stack") or 1),
                base_stats=spec.get("stats") or {},
                slug=slug,
                description=spec.get("description"),
                slot=spec.get("slot"),
                stackable=bool(spec.get("stackable")) if spec.get("stackable") is not None else None,
                max_stack=int(spec.get("max_stack")) if spec.get("max_stack") is not None else None,
                icon_path=spec.get("icon_path"),
                stats=spec.get("stats") or None,
                on_use=spec.get("on_use") or None,
                on_equip=spec.get("on_equip") or None,
                tags=spec.get("tags") or None,
            )
            db.session.add(itm)
            created += 1
        else:
            itm.name = spec.get("name") or itm.name
            itm.type = spec.get("type") or itm.type
            itm.rarity = spec.get("rarity") or itm.rarity
            if spec.get("max_stack") is not None:
                try:
                    itm.max_stack = int(spec.get("max_stack"))
                except Exception:
                    pass
            itm.description = spec.get("description") or itm.description
            itm.slot = spec.get("slot") or itm.slot
            if spec.get("stackable") is not None:
                itm.stackable = bool(spec.get("stackable"))
            itm.icon_path = spec.get("icon_path") or itm.icon_path
            itm.stats = spec.get("stats") or itm.stats
            itm.on_use = spec.get("on_use") or itm.on_use
            itm.on_equip = spec.get("on_equip") or itm.on_equip
            itm.tags = spec.get("tags") or itm.tags
            updated += 1
    db.session.commit()
    print(json.dumps({"ok": True, "created": created, "updated": updated}, indent=2))

    # Upsert loadout rows
    cls = (loadout.get("class") or "warrior").lower()
    level_min = int(loadout.get("level_min") or 1)
    level_max = int(loadout.get("level_max") or 10)
    # Clear existing overlapping range for class to keep idempotent simplicity
    StarterLoadout.query.filter_by(class_name=cls).filter(
        StarterLoadout.level_min == level_min, StarterLoadout.level_max == level_max
    ).delete(synchronize_session=False)
    items_spec = loadout.get("items") or []
    # Map slug -> item_id
    slugs = [s.get("slug") for s in items_spec if s.get("slug")]
    from app.models.items import Item as ItemModel
    rows = ItemModel.query.filter(ItemModel.slug.in_(slugs)).all() if slugs else []
    by_slug = {r.slug: r for r in rows}
    added = 0
    for it in items_spec:
        r = by_slug.get(it.get("slug"))
        if not r:
            continue
        db.session.add(StarterLoadout(
            class_name=cls,
            level_min=level_min,
            level_max=level_max,
            item_id=r.item_id,
            quantity=int(it.get("quantity") or 1),
        ))
        added += 1
    db.session.commit()
    print(json.dumps({"ok": True, "loadout": {"class": cls, "level_min": level_min, "level_max": level_max, "items": added}}, indent=2))
    # Export catalog for client consumption
    try:
        from types import SimpleNamespace
        cmd_export_catalog(SimpleNamespace(out="static/public/api/catalog.json"))
    except Exception:
        pass


def cmd_export_catalog(args):
    from app.models.items import Item
    out_path = args.out
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    rows = (
        Item.query
        .order_by(Item.slug.asc().nullslast())
        .all()
    )
    data = [
        {
            "slug": r.slug,
            "name": r.name,
            "type": r.type,
            "slot": r.slot,
            "icon_path": r.icon_path,
            "stackable": bool(r.stackable) if r.stackable is not None else None,
            "max_stack": r.max_stack,
            "stats": r.stats or r.base_stats or {},
            "on_use": r.on_use,
            "on_equip": r.on_equip,
            "tags": r.tags,
        }
        for r in rows if r.slug
    ]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(json.dumps({"ok": True, "path": out_path, "count": len(data)}, indent=2))

def _user_by_selector(user_id: Optional[str], email: Optional[str]) -> Optional[User]:
    q = User.query
    if user_id: q = q.filter(User.user_id == user_id)
    if email:   q = q.filter(User.email == email)
    return q.first()

def _character_by_selector(char_id: Optional[str], email: Optional[str], char_name: Optional[str]) -> Optional[Character]:
    if char_id:
        return Character.query.filter_by(character_id=char_id).first()
    if email and char_name:
        u = User.query.filter_by(email=email).first()
        if not u: return None
        return (Character.query
                .filter_by(user_id=u.user_id, name=char_name)
                .order_by(Character.created_at.asc())
                .first())
    return None

def _xy_from_character(c: Character):
    # prefer last_coords (JSON text) -> cur_loc "x,y" -> legacy (if present)
    x = y = None
    if hasattr(c, "last_coords") and c.last_coords:
        try:
            o = c.last_coords if isinstance(c.last_coords, dict) else json.loads(c.last_coords)
            x, y = int(o.get("x")), int(o.get("y"))
            return x, y
        except Exception:
            pass
    if hasattr(c, "cur_loc") and c.cur_loc:
        try:
            a,b = str(c.cur_loc).split(",",1)
            return int(a), int(b)
        except Exception:
            pass
    if hasattr(c, "x") and hasattr(c, "y"):
        try: return int(c.x), int(c.y)
        except Exception: pass
    return None, None

# --------------------
# Commands
# --------------------

def cmd_users(args):
    rows = []
    q = User.query
    if args.email:
        q = q.filter(User.email.like(f"%{args.email}%"))
    q = q.order_by(User.created_at.desc())
    for u in q.all():
        active_name = None
        if getattr(u, "selected_character_id", None):
            ac = Character.query.filter_by(character_id=u.selected_character_id).first()
            active_name = ac.name if ac else None
        rows.append((
            u.user_id, u.email, u.handle, u.display_name, u.age,
            _fmt_dt(u.created_at), _fmt_dt(u.last_login_at),
            active_name, u.characters.count(),
            "Active" if u.is_active else "Disabled",
            getattr(u, "role", "user")
        ))
    print_rows(rows, [
        "user_id","email","handle","display_name","age",
        "created_at","last_login","active_char","#chars","status","role"
    ])

def cmd_user(args):
    u = _user_by_selector(args.id, args.email)
    if not u:
        print("User not found.")
        return
    payload = dict(
        user_id=u.user_id,
        email=u.email,
        handle=u.handle,
        display_name=u.display_name,
        age=u.age,
        is_active=u.is_active,
        created_at=_fmt_dt(u.created_at),
        last_login_at=_fmt_dt(u.last_login_at),
        selected_character_id=getattr(u, "selected_character_id", None),
        role=getattr(u, "role", "user"),
        scopes=_scopes_to_list(getattr(u, "scopes", None)),
        characters=[dict(
            id=c.character_id, name=c.name, class_id=c.class_id,
            level=c.level, is_active=c.is_active
        ) for c in u.characters.order_by(Character.created_at.asc()).all()]
    )
    print(json.dumps(payload, indent=2))

def cmd_user_role(args):
    u = _user_by_selector(args.id, args.email)
    if not u:
        print("User not found.")
        return
    if not args.set:
        print(json.dumps({"user_id": u.user_id, "email": u.email, "role": getattr(u, "role","user")}, indent=2))
        return
    if args.set not in ALLOWED_ROLES:
        raise SystemExit(f"role must be one of: {', '.join(ALLOWED_ROLES)}")
    u.role = args.set
    db.session.commit()
    print(json.dumps({"ok": True, "user_id": u.user_id, "role": u.role}, indent=2))

def cmd_user_scope(args):
    u = _user_by_selector(args.id, args.email)
    if not u:
        print("User not found.")
        return
    cur = set(_scopes_to_list(getattr(u, "scopes", None)))
    if args.clear:
        cur = set()
    if args.add:
        for s in args.add:
            if s: cur.add(s)
    if args.remove:
        for s in args.remove:
            cur.discard(s)
    u.scopes = sorted(cur)
    db.session.commit()
    print(json.dumps({"ok": True, "user_id": u.user_id, "role": getattr(u,"role","user"), "scopes": u.scopes}, indent=2))

def cmd_characters(args):
    q = Character.query
    if args.email:
        u = User.query.filter_by(email=args.email).first()
        if not u:
            print("No such user.")
            return
        q = q.filter(Character.user_id == u.user_id)
    q = q.order_by(Character.created_at.desc())
    rows = []
    for c in q.all():
        x,y = _xy_from_character(c)
        rows.append((
            c.character_id, c.name, getattr(c, "class_id", None), c.level,
            x, y,
            "yes" if c.is_active else "no",
            _fmt_dt(c.created_at)
        ))
    print_rows(rows, ["character_id","name","class","lvl","x","y","active","created_at"])

def cmd_sql(args):
    # Dangerous but sometimes necessary; use responsibly.
    sql = args.query
    if not sql:
        print("Provide --query")
        return
    # Decide if it's a SELECT-ish
    is_select = sql.strip().lower().startswith(("select","pragma","with","show"))
    if is_select:
        res = db.session.execute(sa.text(sql))
        rows = res.fetchall()
        if rows:
            headers = rows[0].keys()
            print_rows([tuple(r) for r in rows], list(headers))
        else:
            print("(no rows)")
    else:
        res = db.session.execute(sa.text(sql))
        db.session.commit()
        try:
            rowcount = res.rowcount
        except Exception:
            rowcount = "?"
        print(json.dumps({"ok": True, "rowcount": rowcount}, indent=2))

def build_parser():
    p = argparse.ArgumentParser(description="Shardbound DB CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("users", help="List users")
    s.add_argument("--email", help="Filter by email contains")
    s.set_defaults(func=cmd_users)

    s = sub.add_parser("user", help="Show a single user (JSON)")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--id")
    g.add_argument("--email")
    s.set_defaults(func=cmd_user)

    s = sub.add_parser("user-role", help="Get or set a user's role")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--id")
    g.add_argument("--email")
    s.add_argument("--set", choices=ALLOWED_ROLES, help="Set a new role")
    s.set_defaults(func=cmd_user_role)

    s = sub.add_parser("user-scope", help="Manage a user's scopes")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--id")
    g.add_argument("--email")
    s.add_argument("--add", action="append", help="Add a scope (repeatable)")
    s.add_argument("--remove", action="append", help="Remove a scope (repeatable)")
    s.add_argument("--clear", action="store_true", help="Clear all scopes")
    s.set_defaults(func=cmd_user_scope)

    s = sub.add_parser("characters", help="List characters")
    s.add_argument("--email", help="Limit to a user's characters")
    s.set_defaults(func=cmd_characters)

    s = sub.add_parser("sql", help="Execute raw SQL (danger!)")
    s.add_argument("--query", required=True)
    s.set_defaults(func=cmd_sql)

    # seed-items
    s = sub.add_parser("seed-items", help="Seed warrior starter catalog and loadout")
    s.add_argument("--file", default="seeds/items/warrior_starter.json")
    s.set_defaults(func=cmd_seed_items)

    # export-catalog
    s = sub.add_parser("export-catalog", help="Export item catalog JSON for client")
    s.add_argument("--out", default="static/public/api/catalog.json")
    s.set_defaults(func=cmd_export_catalog)

    return p

def main():
    app = create_app()
    with app.app_context():
        args = build_parser().parse_args()
        args.func(args)

if __name__ == "__main__":
    main()
