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

    return p

def main():
    app = create_app()
    with app.app_context():
        args = build_parser().parse_args()
        args.func(args)

if __name__ == "__main__":
    main()
