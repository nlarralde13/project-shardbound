# tools/db_cli.py
# Quick DB inspector / data dumper / dev-ops for Shardbound
# Usage examples (from project root, inside venv):
#   python tools/db_cli.py users
#   python tools/db_cli.py characters --email you@example.com
#   python tools/db_cli.py seed --email test@example.com --handle tester --name Aria --class warrior --set-active
#   python tools/db_cli.py set-active --email test@example.com --char-name Aria
#   python tools/db_cli.py delete-character --email test@example.com --char-name Aria
#   python tools/db_cli.py delete-user --email test@example.com --hard --yes
#   python tools/db_cli.py wipe --yes
#   python tools/db_cli.py seed-world --count 2 --prefix demo --overwrite
#   python tools/db_cli.py seed-world --count 3 --prefix sandbox --out-dir static/public/shards --assign-email you@example.com
#   python tools/db_cli.py list-shards
#   python tools/db_cli.py sites --kind port,small_village

import os, sys, argparse, json, csv, uuid, random, string
from pathlib import Path
from datetime import datetime

# --- make sure we can import `app` ---
ROOT = Path(__file__).resolve().parents[1]  # project root
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import sqlalchemy as sa  # type: ignore

# Default to NOT auto-creating tables when running this script
os.environ.setdefault("AUTO_CREATE_TABLES", "0")

from app import create_app  # type: ignore
from app.db import db       # type: ignore
from app.models import User, Character  # type: ignore


def _fmt_dt(dt):
    if not dt:
        return "-"
    if isinstance(dt, str):
        return dt
    try:
        return dt.isoformat(timespec="seconds")
    except Exception:
        return str(dt)


def print_rows(rows, headers):
    # simple fixed-width table printer
    if isinstance(rows, (list, tuple)) and len(rows) == 0:
        print("(no rows)")
        return
    widths = [len(h) for h in headers]
    for r in rows:
        for i, v in enumerate(r):
            widths[i] = max(widths[i], len("" if v is None else str(v)))
    line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    sep = "-+-".join("-" * widths[i] for i in range(len(headers)))
    print(line); print(sep)
    for r in rows:
        print(" | ".join(("" if v is None else str(v)).ljust(widths[i]) for i, v in enumerate(r)))


# -----------------------
# helpers / selectors
# -----------------------

def get_user_by_selector(id=None, email=None) -> User | None:
    if id:
        return User.query.get(id)
    if email:
        return User.query.filter(User.email.ilike(email)).first()
    return None

def get_char_for_user(user: User, char_id=None, char_name=None) -> Character | None:
    q = Character.query.filter_by(user_id=user.user_id, is_deleted=False)
    if char_id:
        return q.filter_by(character_id=char_id).first()
    if char_name:
        return q.filter(Character.name.ilike(char_name)).first()
    return None

def rand_handle(prefix="user"):
    tail = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}_{tail}"

def rand_name():
    first = random.choice(["Aria","Doran","Kira","Lio","Maren","Nyx","Oren","Pax","Rhea","Soren","Tala"])
    last  = random.choice(["Blackbriar","Stormfall","Duskhaven","Brightwind","Ironwood","Starfield"])
    return f"{first} {last}"


# -----------------------
# list & inspect commands
# -----------------------

def cmd_users(args):
    q = User.query
    if args.email:
        q = q.filter(User.email.ilike(f"%{args.email}%"))
    if args.handle:
        q = q.filter(User.handle.ilike(f"%{args.handle}%"))
    q = q.order_by(User.created_at.asc())

    rows = []
    for u in q.all():
        active_name = "-"
        if u.selected_character_id:
            c = Character.query.filter_by(character_id=u.selected_character_id).first()
            if c:
                active_name = c.name
        rows.append((
            u.user_id, u.email, u.handle, u.display_name, u.age,
            _fmt_dt(u.created_at), _fmt_dt(u.last_login_at),
            active_name, u.characters.count(), "Active" if u.is_active else "Disabled"
        ))
    headers = ["user_id", "email", "handle", "display_name", "age", "created_at", "last_login", "active_char", "#chars", "status"]
    print_rows(rows, headers)


def cmd_user(args):
    u = get_user_by_selector(id=args.id, email=args.email)
    if not u:
        print("User not found."); return
    payload = dict(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        age=u.age, is_active=u.is_active, created_at=_fmt_dt(u.created_at),
        last_login_at=_fmt_dt(u.last_login_at), selected_character_id=u.selected_character_id,
        characters=[dict(id=c.character_id, name=c.name, class_id=c.class_id, level=c.level, deleted=c.is_deleted)
                    for c in u.characters.order_by(Character.created_at.asc()).all()]
    )
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def cmd_characters(args):
    q = Character.query.filter_by(is_deleted=False)
    if args.user_id:
        q = q.filter(Character.user_id == args.user_id)
    if args.email:
        u = get_user_by_selector(email=args.email)
        if not u:
            print("No user with that email."); return
        q = q.filter(Character.user_id == u.user_id)
    if args.name:
        q = q.filter(Character.name.ilike(f"%{args.name}%"))
    q = q.order_by(Character.created_at.asc())

    rows = []
    for c in q.all():
        rows.append((
            c.character_id, c.name, c.class_id or "-", c.level or 1, c.user_id,
            c.shard_id or "-", c.x, c.y, _fmt_dt(c.created_at)
        ))
    headers = ["character_id", "name", "class", "level", "user_id", "shard_id", "x", "y", "created_at"]
    print_rows(rows, headers)


def cmd_tables(_args):
    inspector = sa.inspect(db.engine)
    print("Tables:")
    for t in inspector.get_table_names():
        print(" -", t)


def cmd_head(args):
    table = args.table
    n = int(args.n)
    stmt = sa.text(f"SELECT * FROM {table} LIMIT :n")
    res = db.session.execute(stmt, {"n": n})
    rows = res.fetchall()
    headers = res.keys()
    print_rows(rows, headers)


def cmd_sql(args):
    q = args.query.strip()
    res = db.session.execute(sa.text(q))
    try:
        rows = res.fetchall()
        headers = res.keys()
        print_rows(rows, headers)
    except sa.exc.ResourceClosedError:
        print("OK (no result set).")


def cmd_export(args):
    table = args.table
    fmt = args.format.lower()
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    res = db.session.execute(sa.text(f"SELECT * FROM {table}"))
    rows = res.fetchall()
    headers = list(res.keys())

    if fmt == "json":
        with open(out, "w", encoding="utf-8") as f:
            json.dump([dict(zip(headers, r)) for r in rows], f, ensure_ascii=False, indent=2)
    elif fmt == "csv":
        with open(out, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f); w.writerow(headers)
            for r in rows: w.writerow(list(r))
    else:
        print("Use --format json|csv"); return
    print(f"Wrote {len(rows)} rows to {out}")


def parse_sites_from_shards(shards_dir: Path, kinds_filter):
    results = []
    for p in sorted(shards_dir.glob("*.json")):
        try:
            data = json.loads(p.read_text("utf-8"))
        except Exception:
            continue
        sites = data.get("sites") or {}
        for key, site in sites.items():
            name = site.get("name", key)
            coords = site.get("coords", site.get("coord", ""))
            kind = key
            if kinds_filter and kind not in kinds_filter:
                continue
            results.append((p.name, kind, name, coords))
    return results


def cmd_sites(args):
    shards_dir = Path(args.dir) if args.dir else ROOT / "static" / "public" / "shards"
    kinds = set(args.kind.split(",")) if args.kind else None
    rows = parse_sites_from_shards(shards_dir, kinds)
    if not rows:
        print(f"No sites found in {shards_dir}")
        return
    headers = ["shard_file", "key/kind", "name", "coords"]
    print_rows(rows, headers)


# -----------------------
# NEW: seed dev data
# -----------------------

def cmd_seed(args):
    email = (args.email or f"dev_{uuid.uuid4().hex[:6]}@example.com").lower()
    handle = args.handle or rand_handle("dev")
    display_name = args.display_name or handle.capitalize()
    age = int(args.age) if args.age else 21

    u = User.query.filter_by(email=email).first()
    if u:
        print(f"Reusing existing user: {u.email} (id={u.user_id})")
    else:
        u = User(email=email, handle=handle, display_name=display_name, age=age, is_active=True)
        db.session.add(u); db.session.flush()
        print(f"Created user: {u.email} (id={u.user_id})")

    created_char = None
    if args.name or args.create_character:
        name = args.name or rand_name()
        class_id = args.class_ or "warrior"
        c = Character(user_id=u.user_id, name=name, class_id=class_id,
                      shard_id=args.shard_id or "00089451_test123", x=args.x or 12, y=args.y or 15,
                      state={"seeded": True})
        db.session.add(c); db.session.flush()
        print(f"Created character: {c.name} (id={c.character_id})")
        created_char = c

    if args.set_active and created_char:
        u.selected_character_id = created_char.character_id
        print(f"Set active character to {created_char.character_id}")
    elif args.set_active and not created_char and u.selected_character_id:
        print(f"Active character already set: {u.selected_character_id}")
    elif args.set_active and not created_char and not u.selected_character_id:
        first = u.characters.filter_by(is_deleted=False).order_by(Character.created_at.asc()).first()
        if first:
            u.selected_character_id = first.character_id
            print(f"Set active character to {first.character_id}")
        else:
            print("No character to set active.")
    db.session.commit()

    payload = dict(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        age=u.age, is_active=u.is_active, selected_character_id=u.selected_character_id
    )
    print(json.dumps(payload, indent=2))


def cmd_set_active(args):
    u = get_user_by_selector(id=args.user_id, email=args.email)
    if not u:
        print("User not found."); return
    c = get_char_for_user(u, char_id=args.char_id, char_name=args.char_name)
    if not c:
        print("Character not found for that user."); return
    if c.is_deleted:
        print("Cannot set a deleted character active."); return
    u.selected_character_id = c.character_id
    db.session.commit()
    print(f"Active character for {u.email} set to {c.name} ({c.character_id})")


def cmd_delete_character(args):
    u = get_user_by_selector(id=args.user_id, email=args.email)
    if not u:
        print("User not found."); return
    c = get_char_for_user(u, char_id=args.char_id, char_name=args.char_name)
    if not c:
        print("Character not found for that user."); return

    if not args.hard:
        c.is_deleted = True
        if u.selected_character_id == c.character_id:
            u.selected_character_id = None
        db.session.commit()
        print(f"Soft-deleted character {c.name} ({c.character_id})")
    else:
        if u.selected_character_id == c.character_id:
            u.selected_character_id = None
        db.session.delete(c); db.session.commit()
        print(f"Hard-deleted character {c.name} ({c.character_id})")


def cmd_delete_user(args):
    u = get_user_by_selector(id=args.user_id, email=args.email)
    if not u:
        print("User not found."); return

    if not args.hard:
        u.is_active = False
        for c in u.characters.all():
            c.is_deleted = True
        u.selected_character_id = None
        db.session.commit()
        print(f"Soft-deleted user {u.email} (disabled account and characters).")
        return

    if not args.yes:
        print("Add --yes to confirm hard deletion.")
        return
    for c in u.characters.all():
        db.session.delete(c)
    db.session.delete(u)
    db.session.commit()
    print(f"Hard-deleted user {u.email} and all characters.")


def cmd_wipe(args):
    if not args.yes:
        print("This will delete ALL rows from 'character' and 'users'. Add --yes to confirm.")
        return
    n_char = db.session.query(Character).delete()
    n_user = db.session.query(User).delete()
    db.session.commit()
    print(f"Wiped data. Deleted {n_char} characters, {n_user} users.")


# -----------------------
# NEW: world seeding
# -----------------------

DEMO_SITE_TEMPLATES = [
    ("city",     "Highspire"),
    ("town",     "Stoneford"),
    ("small_village", "Fort Lonely"),
    ("port",     "Port Smith"),
    ("dungeon",  "Hidden Grove"),
    ("ruins",    "Old Ruins"),
    ("volcano",  "Ashmaw"),
]

DEMO_RESOURCES = ["sap_wood","ash_wood","maple_wood","copper_deposit","iron_deposit","silver_deposit"]
DEMO_QUESTS    = ["Q001","Q002","Q003"]

def _rand_coord(w, h):
    return f"{random.randint(0, max(0,w-1))},{random.randint(0, max(0,h-1))}"

def generate_demo_shard(shard_id: str, label: str, width: int = 64, height: int = 64, rng_seed: int | None = None):
    if rng_seed is not None:
        random.seed(rng_seed)

    sites = {}
    # ensure unique numeric suffixes per kind to align with your minimap naming (e.g., dungeon_1, port_1)
    counters = {}
    for kind, default_name in DEMO_SITE_TEMPLATES:
        counters.setdefault(kind, 0)
        counters[kind] += 1
        key = f"{kind}_{counters[kind]}"
        site = {"name": default_name, "coords": _rand_coord(width, height)}
        if kind == "dungeon":
            site["dungeon_id"] = "D001"
        sites[key] = site

    data = {
        "shard_id": shard_id,
        "label": label,
        "version": 1,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "meta": {"width": width, "height": height},
        "sites": sites,
        "available_quests": DEMO_QUESTS,
        "shard_resources": DEMO_RESOURCES,
    }
    return data

def cmd_seed_world(args):
    out_dir = Path(args.out_dir) if args.out_dir else (ROOT / "static" / "public" / "shards")
    out_dir.mkdir(parents=True, exist_ok=True)

    count  = int(args.count or 2)
    prefix = args.prefix or "demo"
    width  = int(args.width or 64)
    height = int(args.height or 64)
    seed   = int(args.seed) if args.seed is not None else None
    overwrite = bool(args.overwrite)

    created = []
    for i in range(1, count+1):
        shard_id = f"{prefix}_{i:04d}"
        label = f"{prefix.title()} Shard {i}"
        data = generate_demo_shard(shard_id, label, width, height, (seed + i) if seed is not None else None)
        out_path = out_dir / f"{shard_id}.json"
        if out_path.exists() and not overwrite:
            print(f"Skip (exists): {out_path}")
            continue
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out_path}")
        created.append(shard_id)

    # Optional: assign first shard to a user's characters
    if args.assign_email and created:
        u = get_user_by_selector(email=args.assign_email)
        if not u:
            print(f"assign_email: no user found for {args.assign_email}")
        else:
            first = created[0]
            n = 0
            for c in u.characters.filter_by(is_deleted=False).all():
                c.shard_id = first
                n += 1
            db.session.commit()
            print(f"Assigned shard '{first}' to {n} character(s) for {u.email}")

def cmd_list_shards(args):
    dir_ = Path(args.dir) if args.dir else (ROOT / "static" / "public" / "shards")
    files = sorted(dir_.glob("*.json"))
    if not files:
        print(f"No shard json files in {dir_}")
        return
    rows = []
    for p in files:
        try:
            data = json.loads(p.read_text("utf-8"))
        except Exception:
            rows.append((p.name, "—", "—", "—"))
            continue
        rows.append((p.name, data.get("shard_id","—"), data.get("label","—"), data.get("created_at","—")))
    print_rows(rows, ["file", "shard_id", "label", "created_at"])


# -----------------------
# argparse wiring
# -----------------------

def build_parser():
    p = argparse.ArgumentParser(description="Shardbound DB quick inspector + dev-ops")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("users", help="List users")
    s.add_argument("--email", help="Filter by email (ILIKE)")
    s.add_argument("--handle", help="Filter by handle (ILIKE)")
    s.set_defaults(func=cmd_users)

    s = sub.add_parser("user", help="Show a single user (+characters) as JSON")
    g = s.add_mutually_exclusive_group(required=True)
    g.add_argument("--id", dest="id")
    g.add_argument("--email", dest="email")
    s.set_defaults(func=cmd_user)

    s = sub.add_parser("characters", help="List characters")
    s.add_argument("--user-id")
    s.add_argument("--email", help="Filter by user email")
    s.add_argument("--name", help="Filter by character name (ILIKE)")
    s.set_defaults(func=cmd_characters)

    s = sub.add_parser("tables", help="List DB tables")
    s.set_defaults(func=cmd_tables)

    s = sub.add_parser("head", help="Show top N rows from a table")
    s.add_argument("--table", required=True)
    s.add_argument("--n", default=10)
    s.set_defaults(func=cmd_head)

    s = sub.add_parser("sql", help="Run ad-hoc SQL (be careful)")
    s.add_argument("--query", required=True)
    s.set_defaults(func=cmd_sql)

    s = sub.add_parser("export", help="Export a table to JSON/CSV")
    s.add_argument("--table", required=True)
    s.add_argument("--format", choices=["json", "csv"], required=True)
    s.add_argument("--out", required=True, help="Output file path")
    s.set_defaults(func=cmd_export)

    s = sub.add_parser("sites", help="Scan shard JSON for sites/towns")
    s.add_argument("--dir", help="Folder with shard JSON (default: static/public/shards)")
    s.add_argument("--kind", help="Filter by kind key(s), comma-separated (e.g. 'port,small_village')")
    s.set_defaults(func=cmd_sites)

    # seed user/character
    s = sub.add_parser("seed", help="Create a dev user + optional character")
    s.add_argument("--email", help="User email (default: dev_<rand>@example.com)")
    s.add_argument("--handle", help="User handle (default: dev_<rand>)")
    s.add_argument("--display-name", help="Display name (default: Handle.capitalize())")
    s.add_argument("--age", help="Age (default: 21)")
    s.add_argument("--create-character", action="store_true", help="Also create a character (if --name not given)")
    s.add_argument("--name", help="Character name (default: random)")
    s.add_argument("--class", dest="class_", help="Class id (default: warrior)")
    s.add_argument("--shard-id", help="Shard id (default: 00089451_test123)")
    s.add_argument("--x", type=int, help="Start x (default: 12)")
    s.add_argument("--y", type=int, help="Start y (default: 15)")
    s.add_argument("--set-active", action="store_true", help="Set newly created / first character as active")
    s.set_defaults(func=cmd_seed)

    # set active
    s = sub.add_parser("set-active", help="Set a user's active character")
    ugrp = s.add_mutually_exclusive_group(required=True)
    ugrp.add_argument("--user-id")
    ugrp.add_argument("--email")
    cgrp = s.add_mutually_exclusive_group(required=True)
    cgrp.add_argument("--char-id")
    cgrp.add_argument("--char-name")
    s.set_defaults(func=cmd_set_active)

    # delete character
    s = sub.add_parser("delete-character", help="Delete a character (soft by default)")
    ugrp = s.add_mutually_exclusive_group(required=True)
    ugrp.add_argument("--user-id")
    ugrp.add_argument("--email")
    cgrp = s.add_mutually_exclusive_group(required=True)
    cgrp.add_argument("--char-id")
    cgrp.add_argument("--char-name")
    s.add_argument("--hard", action="store_true", help="Hard delete (remove row)")
    s.set_defaults(func=cmd_delete_character)

    # delete user
    s = sub.add_parser("delete-user", help="Delete a user (soft by default)")
    ugrp = s.add_mutually_exclusive_group(required=True)
    ugrp.add_argument("--user-id")
    ugrp.add_argument("--email")
    s.add_argument("--hard", action="store_true", help="Hard delete (remove row + characters)")
    s.add_argument("--yes", action="store_true", help="Skip confirmation for hard delete")
    s.set_defaults(func=cmd_delete_user)

    # wipe all
    s = sub.add_parser("wipe", help="Delete ALL rows from character and users (dev only)")
    s.add_argument("--yes", action="store_true", help="Confirm destructive wipe")
    s.set_defaults(func=cmd_wipe)

    # NEW: seed-world
    s = sub.add_parser("seed-world", help="Generate demo shard JSON files with canned sites/resources/quests")
    s.add_argument("--count", type=int, default=2, help="How many shards to generate")
    s.add_argument("--prefix", default="demo", help="Shard ID prefix (files become <prefix>_0001.json, etc.)")
    s.add_argument("--out-dir", help="Output directory (default: static/public/shards)")
    s.add_argument("--width", type=int, default=64)
    s.add_argument("--height", type=int, default=64)
    s.add_argument("--seed", type=int, help="Random seed (for reproducible coords)")
    s.add_argument("--overwrite", action="store_true", help="Overwrite existing files")
    s.add_argument("--assign-email", help="After writing, assign FIRST shard to all characters of this user")
    s.set_defaults(func=cmd_seed_world)

    # NEW: list-shards
    s = sub.add_parser("list-shards", help="List shard JSON files in a folder")
    s.add_argument("--dir", help="Folder path (default: static/public/shards)")
    s.set_defaults(func=cmd_list_shards)

    return p


def main():
    app = create_app()
    with app.app_context():
        parser = build_parser()
        args = parser.parse_args()
        args.func(args)


if __name__ == "__main__":
    main()
