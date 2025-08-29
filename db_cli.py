# tools/db_cli.py
# ┌───────────────────────────────────────────────────────────────────────┐
# │  MÍMIR’S VAULT — Shardbound DB CLI                                    │
# │  Dev-ops & data spelunking: users • characters • items • inventory    │
# └───────────────────────────────────────────────────────────────────────┘
# Usage (examples):
#   python tools/db_cli.py users
#   python tools/db_cli.py characters --email you@example.com
#   python tools/db_cli.py items --type weapon
#   python tools/db_cli.py item-upsert --json '{"item_id":"itm_sword","item_version":"1.0","name":"Sword","type":"weapon","rarity":"common","stack_size":1,"base_stats":{"atk":5,"icon":"/static/items/sword.png"}}'
#   python tools/db_cli.py mint --item-id itm_sword --quantity 2
#   python tools/db_cli.py inventory --email you@example.com --char-name Aria
#   python tools/db_cli.py grant --email you@example.com --char-name Aria --item-id itm_sword --qty 2 --mint --equip
#   python tools/db_cli.py items-export --file items.json
#   python tools/db_cli.py items-import --file items.json
#   python tools/db_cli.py validate-items
#
#   # World helpers you already had:
#   python tools/db_cli.py seed-world --count 2 --prefix demo --overwrite
#   python tools/db_cli.py list-shards

import os, sys, argparse, json, csv, uuid, random, string
from pathlib import Path
from datetime import datetime

# --- import app modules ---
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import sqlalchemy as sa  # type: ignore
os.environ.setdefault("AUTO_CREATE_TABLES", "0")

from app import create_app  # type: ignore
from app.models import db, User, Character  # type: ignore
# New models (adjust if your names differ)
try:
    from app.models import Item, ItemInstance, CharacterInventory  # type: ignore
except Exception:  # helpful error if models aren’t wired yet
    Item = ItemInstance = CharacterInventory = None  # type: ignore


def _fmt_dt(dt):
    if not dt: return "-"
    if isinstance(dt, str): return dt
    try: return dt.isoformat(timespec="seconds")
    except Exception: return str(dt)

def _uid(): return uuid.uuid4().hex

def print_rows(rows, headers):
    if isinstance(rows, (list, tuple)) and len(rows) == 0:
        print("(no rows)"); return
    widths = [len(h) for h in headers]
    for r in rows:
        for i, v in enumerate(r):
            widths[i] = max(widths[i], len("" if v is None else str(v)))
    line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    sep  = "-+-".join("-" * widths[i] for i in range(len(headers)))
    print(line); print(sep)
    for r in rows:
        print(" | ".join(("" if v is None else str(v)).ljust(widths[i]) for i, v in enumerate(r)))


# -----------------------
# helpers / selectors
# -----------------------
def get_user_by_selector(id=None, email=None) -> User | None:
    if id: return User.query.get(id)
    if email: return User.query.filter(User.email.ilike(email)).first()
    return None

def get_char_for_user(user: User, char_id=None, char_name=None) -> Character | None:
    q = Character.query.filter_by(user_id=user.user_id, is_active=True)
    if char_id: return q.filter_by(character_id=char_id).first()
    if char_name: return q.filter(Character.name.ilike(char_name)).first()
    return None

def rand_handle(prefix="user"):
    tail = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}_{tail}"

def rand_name():
    first = random.choice(["Aria","Doran","Kira","Lio","Maren","Nyx","Oren","Pax","Rhea","Soren","Tala"])
    last  = random.choice(["Blackbriar","Stormfall","Duskhaven","Brightwind","Ironwood","Starfield"])
    return f"{first} {last}"


# =======================
# USERS / CHARACTERS (existing set, kept)
# =======================
def cmd_users(args):
    q = User.query
    if args.email: q = q.filter(User.email.ilike(f"%{args.email}%"))
    if args.handle: q = q.filter(User.handle.ilike(f"%{args.handle}%"))
    q = q.order_by(User.created_at.asc())
    rows = []
    for u in q.all():
        active_name = "-"
        if u.selected_character_id:
            c = Character.query.filter_by(character_id=u.selected_character_id).first()
            if c: active_name = c.name
        rows.append((u.user_id, u.email, u.handle, u.display_name, u.age,
                     _fmt_dt(u.created_at), _fmt_dt(u.last_login_at),
                     active_name, u.characters.count(), "Active" if u.is_active else "Disabled"))
    print_rows(rows, ["user_id","email","handle","display_name","age","created_at","last_login","active_char","#chars","status"])

def cmd_user(args):
    u = get_user_by_selector(id=args.id, email=args.email)
    if not u: print("User not found."); return
    payload = dict(
        user_id=u.user_id, email=u.email, handle=u.handle, display_name=u.display_name,
        age=u.age, is_active=u.is_active, created_at=_fmt_dt(u.created_at),
        last_login_at=_fmt_dt(u.last_login_at), selected_character_id=u.selected_character_id,
        characters=[dict(id=c.character_id, name=c.name, class_id=c.class_id, level=c.level, is_active=c.is_active)
                    for c in u.characters.order_by(Character.created_at.asc()).all()]
    )
    print(json.dumps(payload, indent=2, ensure_ascii=False))

def cmd_characters(args):
    q = Character.query.filter_by(is_active=True)
    if args.user_id: q = q.filter(Character.user_id == args.user_id)
    if args.email:
        u = get_user_by_selector(email=args.email)
        if not u: print("No user with that email."); return
        q = q.filter(Character.user_id == u.user_id)
    if args.name: q = q.filter(Character.name.ilike(f"%{args.name}%"))
    q = q.order_by(Character.created_at.asc())
    rows = [(c.character_id, c.name, c.class_id or "-", c.level or 1, c.user_id,
             c.shard_id or "-", c.x, c.y, _fmt_dt(c.created_at)) for c in q.all()]
    print_rows(rows, ["character_id","name","class","level","user_id","shard_id","x","y","created_at"])

def cmd_tables(_args):
    inspector = sa.inspect(db.engine)
    print("Tables:")
    for t in inspector.get_table_names():
        print(" -", t)

def cmd_head(args):
    res = db.session.execute(sa.text(f"SELECT * FROM {args.table} LIMIT :n"), {"n": int(args.n)})
    rows = res.fetchall()
    print_rows(rows, res.keys())

def cmd_sql(args):
    q = args.query.strip()
    res = db.session.execute(sa.text(q))
    try:
        rows = res.fetchall()
        print_rows(rows, res.keys())
    except sa.exc.ResourceClosedError:
        print("OK (no result set).")

def cmd_export(args):
    table, fmt, out = args.table, args.format.lower(), Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    res = db.session.execute(sa.text(f"SELECT * FROM {table}"))
    rows = res.fetchall(); headers = list(res.keys())
    if fmt == "json":
        out.write_text(json.dumps([dict(zip(headers, r)) for r in rows], ensure_ascii=False, indent=2), encoding="utf-8")
    elif fmt == "csv":
        with open(out, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f); w.writerow(headers)
            for r in rows: w.writerow(list(r))
    else:
        print("Use --format json|csv"); return
    print(f"Wrote {len(rows)} rows to {out}")


# =======================
# ITEMS / INSTANCES / INVENTORY  (NEW)
# =======================
def _require_models():
    if Item is None or ItemInstance is None or CharacterInventory is None:
        raise SystemExit("Item/Instance/Inventory models are not available under app.models. Check your imports.")

def cmd_items(args):
    _require_models()
    q = Item.query
    if args.id: q = q.filter(Item.item_id.ilike(f"%{args.id}%"))
    if args.name: q = q.filter(Item.name.ilike(f"%{args.name}%"))
    if args.type: q = q.filter(Item.type.ilike(args.type))
    if args.rarity: q = q.filter(Item.rarity.ilike(args.rarity))
    q = q.order_by(Item.item_id.asc())
    # count instances per item
    cnt_sub = db.session.query(ItemInstance.item_id, sa.func.count().label("n_inst")).group_by(ItemInstance.item_id).subquery()
    rows = []
    for it in q.outerjoin(cnt_sub, cnt_sub.c.item_id == Item.item_id).all():
        n_inst = db.session.query(cnt_sub.c.n_inst).filter(cnt_sub.c.item_id == it.item_id).scalar() or 0
        rows.append((it.item_id, it.item_version, it.name, it.type, it.rarity, it.stack_size, n_inst))
    print_rows(rows, ["item_id","version","name","type","rarity","stack","#inst"])

def cmd_item(args):
    _require_models()
    it = Item.query.get(args.id)
    if not it: print("Item not found."); return
    payload = dict(item_id=it.item_id, item_version=it.item_version, name=it.name,
                   type=it.type, rarity=it.rarity, stack_size=it.stack_size, base_stats=it.base_stats)
    print(json.dumps(payload, indent=2, ensure_ascii=False))

def cmd_item_upsert(args):
    _require_models()
    data = {}
    if args.file: data = json.loads(Path(args.file).read_text("utf-8"))
    if args.json: data.update(json.loads(args.json))
    for k in ["item_id","item_version","name","type","rarity"]:
        v = getattr(args, k, None)
        if v: data[k] = v
    if args.stack_size is not None: data["stack_size"] = int(args.stack_size)
    if args.base_stats: data["base_stats"] = json.loads(args.base_stats)

    required = ["item_id","item_version","name","type","rarity"]
    missing = [k for k in required if k not in data]
    if missing: raise SystemExit("Missing required fields: " + ", ".join(missing))

    it = Item.query.get(data["item_id"])
    if not it:
        it = Item(item_id=data["item_id"], item_version=data["item_version"], name=data["name"],
                  type=data["type"], rarity=data["rarity"], stack_size=int(data.get("stack_size",1)),
                  base_stats=data.get("base_stats") or {})
        db.session.add(it); action = "created"
    else:
        it.item_version = data["item_version"]; it.name = data["name"]
        it.type = data["type"]; it.rarity = data["rarity"]
        if "stack_size" in data: it.stack_size = int(data["stack_size"])
        if "base_stats" in data and data["base_stats"] is not None: it.base_stats = data["base_stats"]
        action = "updated"
    db.session.commit()
    print(f"Item {action}: {it.item_id}")

def cmd_instances(args):
    _require_models()
    q = ItemInstance.query
    if args.item_id: q = q.filter(ItemInstance.item_id == args.item_id)
    q = q.order_by(ItemInstance.instance_id.asc())
    rows = [(i.instance_id, i.item_id, i.item_version, i.quantity) for i in q.all()]
    print_rows(rows, ["instance_id","item_id","version","qty"])

def cmd_mint(args):
    _require_models()
    it = Item.query.get(args.item_id)
    if not it: raise SystemExit("Item not found.")
    inst = ItemInstance(instance_id=_uid(), item_id=it.item_id,
                        item_version=args.item_version or it.item_version,
                        quantity=max(1, int(args.quantity or 1)))
    db.session.add(inst); db.session.commit()
    print(json.dumps({"message":"instance created","instance_id":inst.instance_id}, indent=2))

def _resolve_character(char_id=None, email=None, char_name=None):
    if char_id: return Character.query.get(char_id)
    if email:
        u = get_user_by_selector(email=email)
        if not u: return None
        return get_char_for_user(u, char_name=char_name)
    return None

def _find_next_free_slot(character_id, start_at=0):
    taken = {row.slot_index for row in CharacterInventory.query.filter_by(character_id=character_id).all()}
    i = start_at
    while i in taken: i += 1
    return i

def cmd_inventory(args):
    _require_models()
    c = _resolve_character(args.char_id, args.email, args.char_name)
    if not c: print("Character not found."); return
    q = (db.session.query(
            CharacterInventory.slot_index, CharacterInventory.item_id, Item.name,
            CharacterInventory.instance_id, CharacterInventory.qty,
            CharacterInventory.equipped, CharacterInventory.acquired_at)
         .outerjoin(Item, Item.item_id == CharacterInventory.item_id)
         .filter(CharacterInventory.character_id == c.character_id)
         .order_by(CharacterInventory.slot_index.asc()))
    rows = [(r.slot_index, r.item_id, r.name or "(unknown)", r.instance_id,
             r.qty, "yes" if r.equipped else "no", _fmt_dt(r.acquired_at)) for r in q.all()]
    print_rows(rows, ["slot","item_id","name","instance_id","qty","eq","acquired_at"])

def cmd_grant(args):
    _require_models()
    c = _resolve_character(args.char_id, args.email, args.char_name)
    if not c: raise SystemExit("Character not found.")
    it = Item.query.get(args.item_id)
    if not it: raise SystemExit("Item not found.")

    instance_id = args.instance_id
    if not instance_id and args.mint:
        inst = ItemInstance(instance_id=_uid(), item_id=it.item_id,
                            item_version=args.item_version or it.item_version,
                            quantity=max(1, int(args.qty or 1)))
        db.session.add(inst); db.session.flush()
        instance_id = inst.instance_id
    if not instance_id: raise SystemExit("Provide --instance-id or add --mint")

    slot_index = args.slot_index if args.slot_index is not None else _find_next_free_slot(c.character_id, args.slot_start or 0)
    existing = CharacterInventory.query.filter_by(character_id=c.character_id, slot_index=int(slot_index)).first()
    if existing and not args.replace:
        raise SystemExit(f"Slot {slot_index} already used; add --replace or omit --slot-index for auto")
    if existing: db.session.delete(existing); db.session.flush()

    row = CharacterInventory(id=_uid(), character_id=c.character_id, slot_index=int(slot_index),
                             item_id=it.item_id, instance_id=instance_id,
                             qty=max(1, int(args.qty or 1)), equipped=bool(args.equip),
                             acquired_at=datetime.utcnow())
    db.session.add(row); db.session.commit()
    print(json.dumps({"message":"granted","character_id":c.character_id,"slot_index":row.slot_index,"instance_id":instance_id}, indent=2))

def cmd_validate_items(_args):
    _require_models()
    problems = []
    for it in Item.query.all():
        if not isinstance(it.base_stats, (dict, list)): problems.append(("item", it.item_id, "base_stats not JSON-object/list"))
        if (it.stack_size or 0) < 1: problems.append(("item", it.item_id, "stack_size < 1"))
    for inst in ItemInstance.query.all():
        if (inst.quantity or 0) < 1: problems.append(("instance", inst.instance_id, "quantity < 1"))
        if not Item.query.get(inst.item_id): problems.append(("instance", inst.instance_id, f"missing parent item {inst.item_id}"))
    for inv in CharacterInventory.query.all():
        if (inv.qty or 0) < 1: problems.append(("inventory", inv.id, "qty < 1"))
        if not ItemInstance.query.get(inv.instance_id): problems.append(("inventory", inv.id, f"missing instance {inv.instance_id}"))
        if not Item.query.get(inv.item_id): problems.append(("inventory", inv.id, f"missing item {inv.item_id}"))
    if not problems: print("All good ✅"); return
    print_rows([(k,i,m) for (k,i,m) in problems], ["kind","id","problem"])

def cmd_items_export(args):
    _require_models()
    data, q = [], Item.query
    if args.type: q = q.filter(Item.type.ilike(args.type))
    if args.rarity: q = q.filter(Item.rarity.ilike(args.rarity))
    for it in q.all():
        data.append(dict(item_id=it.item_id, item_version=it.item_version, name=it.name,
                         type=it.type, rarity=it.rarity, stack_size=it.stack_size, base_stats=it.base_stats))
    Path(args.file).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(data)} items to {args.file}")

def cmd_items_import(args):
    _require_models()
    payload = json.loads(Path(args.file).read_text("utf-8"))
    n_created = n_updated = 0
    for rec in payload:
        it = Item.query.get(rec["item_id"])
        if not it:
            it = Item(**rec); db.session.add(it); n_created += 1
        else:
            it.item_version = rec.get("item_version", it.item_version)
            it.name = rec.get("name", it.name)
            it.type = rec.get("type", it.type)
            it.rarity = rec.get("rarity", it.rarity)
            it.stack_size = rec.get("stack_size", it.stack_size)
            if rec.get("base_stats") is not None: it.base_stats = rec["base_stats"]
            n_updated += 1
    db.session.commit()
    print(f"Imported items. created={n_created} updated={n_updated}")

def cmd_bulk_grant(args):
    _require_models()
    def _all_active_characters(): return Character.query.filter_by(is_active=True).all()
    if not args.item_id and not args.kit_file:
        raise SystemExit("Provide --item-id or --kit-file")
    kit = None
    if args.kit_file:
        kit = json.loads(Path(args.kit_file).read_text("utf-8"))
        if not isinstance(kit, list):
            raise SystemExit("kit-file must be a JSON list of {item_id,qty,equip,slot_offset?}")
    targets = _all_active_characters() if args.all_active else []
    if args.email:
        u = get_user_by_selector(email=args.email)
        if not u: raise SystemExit("User not found")
        c = get_char_for_user(u, char_name=args.char_name) or get_char_for_user(u)
        if not c: raise SystemExit("Character not found for user")
        targets = [c]
    if not targets: raise SystemExit("No characters matched the selection")
    single = None
    if args.item_id:
        it = Item.query.get(args.item_id)
        if not it: raise SystemExit(f"Item not found: {args.item_id}")
        single = dict(item_id=it.item_id, qty=max(1, int(args.qty or 1)), equip=bool(args.equip))
    granted_total = 0
    for c in targets:
        base_slot = args.slot_start or 0
        grants = kit if kit else [single]
        for idx, g in enumerate(grants):
            if not g: continue
            it = Item.query.get(g["item_id"])
            if not it: continue
            inst = ItemInstance(instance_id=_uid(), item_id=it.item_id, item_version=it.item_version, quantity=int(g.get("qty",1)))
            db.session.add(inst); db.session.flush()
            slot = _find_next_free_slot(c.character_id, base_slot + int(g.get("slot_offset", idx)))
            row = CharacterInventory(id=_uid(), character_id=c.character_id, slot_index=slot,
                                     item_id=it.item_id, instance_id=inst.instance_id, qty=int(g.get("qty",1)),
                                     equipped=bool(g.get("equip", False)), acquired_at=datetime.utcnow())
            db.session.add(row); granted_total += 1
    db.session.commit()
    print(f"Granted {granted_total} entries to {len(targets)} character(s).")


# =======================
# WORLD helpers (yours, preserved)
# =======================
DEMO_SITE_TEMPLATES = [
    ("city","Highspire"),("town","Stoneford"),("small_village","Fort Lonely"),
    ("port","Port Smith"),("dungeon","Hidden Grove"),("ruins","Old Ruins"),("volcano","Ashmaw"),
]
DEMO_RESOURCES = ["sap_wood","ash_wood","maple_wood","copper_deposit","iron_deposit","silver_deposit"]
DEMO_QUESTS    = ["Q001","Q002","Q003"]

def _rand_coord(w, h): return f"{random.randint(0, max(0,w-1))},{random.randint(0, max(0,h-1))}"

def generate_demo_shard(shard_id: str, label: str, width: int = 64, height: int = 64, rng_seed: int | None = None):
    if rng_seed is not None: random.seed(rng_seed)
    sites, counters = {}, {}
    for kind, default_name in DEMO_SITE_TEMPLATES:
        counters.setdefault(kind, 0); counters[kind] += 1
        key = f"{kind}_{counters[kind]}"; site = {"name": default_name, "coords": _rand_coord(width, height)}
        if kind == "dungeon": site["dungeon_id"] = "D001"
        sites[key] = site
    return {
        "shard_id": shard_id, "label": label, "version": 1, "created_at": datetime.utcnow().isoformat()+"Z",
        "meta": {"width": width, "height": height}, "sites": sites,
        "available_quests": DEMO_QUESTS, "shard_resources": DEMO_RESOURCES,
    }

def cmd_seed_world(args):
    out_dir = Path(args.out_dir) if args.out_dir else (ROOT / "static" / "public" / "shards")
    out_dir.mkdir(parents=True, exist_ok=True)
    count, prefix, width, height = int(args.count or 2), (args.prefix or "demo"), int(args.width or 64), int(args.height or 64)
    seed = int(args.seed) if args.seed is not None else None
    overwrite = bool(args.overwrite)
    created = []
    for i in range(1, count+1):
        shard_id = f"{prefix}_{i:04d}"; label = f"{prefix.title()} Shard {i}"
        data = generate_demo_shard(shard_id, label, width, height, (seed + i) if seed is not None else None)
        out_path = out_dir / f"{shard_id}.json"
        if out_path.exists() and not overwrite:
            print(f"Skip (exists): {out_path}"); continue
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {out_path}"); created.append(shard_id)
    if args.assign_email and created:
        u = get_user_by_selector(email=args.assign_email)
        if not u: print(f"assign_email: no user for {args.assign_email}")
        else:
            first = created[0]; n = 0
            for c in u.characters.filter_by(is_active=True).all():
                c.shard_id = first; n += 1
            db.session.commit(); print(f"Assigned shard '{first}' to {n} character(s)")

def cmd_list_shards(args):
    dir_ = Path(args.dir) if args.dir else (ROOT / "static" / "public" / "shards")
    files = sorted(dir_.glob("*.json"))
    if not files: print(f"No shard json files in {dir_}"); return
    rows = []
    for p in files:
        try: data = json.loads(p.read_text("utf-8"))
        except Exception: rows.append((p.name, "—", "—", "—")); continue
        rows.append((p.name, data.get("shard_id","—"), data.get("label","—"), data.get("created_at","—")))
    print_rows(rows, ["file","shard_id","label","created_at"])


# =======================
# argparse wiring
# =======================
def build_parser():
    epilog = """
Examples:
  # Items / Instances
  db_cli.py items --type weapon
  db_cli.py item --id itm_potion_small
  db_cli.py item-upsert --json '{"item_id":"itm_potion_small","item_version":"1.0","name":"Minor Healing Potion","type":"consumable","rarity":"common","stack_size":20,"base_stats":{"heal":20,"icon":"/static/items/potion_small.png"}}'
  db_cli.py mint --item-id itm_potion_small --quantity 3
  db_cli.py items-export --file items.json
  db_cli.py items-import --file items.json
  db_cli.py validate-items

  # Inventory
  db_cli.py inventory --email you@example.com --char-name Aria
  db_cli.py grant --email you@example.com --char-name Aria --item-id itm_potion_small --qty 3 --mint --equip --slot-start 0

  # Users / Characters (existing)
  db_cli.py users
  db_cli.py characters --email you@example.com

  # World JSON
  db_cli.py seed-world --count 3 --prefix sandbox --overwrite
  db_cli.py list-shards
"""
    p = argparse.ArgumentParser(
        prog="db_cli",
        description="Mímir’s Vault — DB inspector & toolbelt for Shardbound",
        epilog=epilog,
        formatter_class=argparse.RawTextHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    # Users/characters (kept)
    s = sub.add_parser("users", help="List users")
    s.add_argument("--email"); s.add_argument("--handle"); s.set_defaults(func=cmd_users)

    s = sub.add_parser("user", help="Show one user (+characters) as JSON")
    g = s.add_mutually_exclusive_group(required=True); g.add_argument("--id"); g.add_argument("--email")
    s.set_defaults(func=cmd_user)

    s = sub.add_parser("characters", help="List characters")
    s.add_argument("--user-id"); s.add_argument("--email"); s.add_argument("--name"); s.set_defaults(func=cmd_characters)

    s = sub.add_parser("tables", help="List DB tables"); s.set_defaults(func=cmd_tables)
    s = sub.add_parser("head", help="Show top N from a table"); s.add_argument("--table", required=True); s.add_argument("--n", default=10); s.set_defaults(func=cmd_head)
    s = sub.add_parser("sql", help="Run ad-hoc SQL (be careful)"); s.add_argument("--query", required=True); s.set_defaults(func=cmd_sql)
    s = sub.add_parser("export", help="Export a table to JSON/CSV"); s.add_argument("--table", required=True); s.add_argument("--format", choices=["json","csv"], required=True); s.add_argument("--out", required=True); s.set_defaults(func=cmd_export)

    # Items / Instances / Inventory (NEW)
    s = sub.add_parser("items", help="List items (filters: --id --name --type --rarity)"); s.add_argument("--id"); s.add_argument("--name"); s.add_argument("--type"); s.add_argument("--rarity"); s.set_defaults(func=cmd_items)
    s = sub.add_parser("item", help="Show one item as JSON"); s.add_argument("--id", required=True); s.set_defaults(func=cmd_item)
    s = sub.add_parser("item-upsert", help="Create/Update an item (from --json or flags)"); s.add_argument("--file"); s.add_argument("--json"); s.add_argument("--item_id"); s.add_argument("--item_version"); s.add_argument("--name"); s.add_argument("--type"); s.add_argument("--rarity"); s.add_argument("--stack_size", type=int); s.add_argument("--base_stats"); s.set_defaults(func=cmd_item_upsert)
    s = sub.add_parser("instances", help="List item instances"); s.add_argument("--item-id"); s.set_defaults(func=cmd_instances)
    s = sub.add_parser("mint", help="Mint an item instance"); s.add_argument("--item-id", required=True); s.add_argument("--item-version"); s.add_argument("--quantity", type=int, default=1); s.set_defaults(func=cmd_mint)

    s = sub.add_parser("inventory", help="List inventory for a character")
    g = s.add_mutually_exclusive_group(required=True); g.add_argument("--char-id"); g.add_argument("--email")
    s.add_argument("--char-name"); s.set_defaults(func=cmd_inventory)

    s = sub.add_parser("grant", help="Grant an instance to character inventory")
    g = s.add_mutually_exclusive_group(required=False); g.add_argument("--char-id"); g.add_argument("--email")
    s.add_argument("--char-name"); s.add_argument("--slot-index", type=int); s.add_argument("--slot-start", type=int)
    s.add_argument("--item-id"); s.add_argument("--item-version"); s.add_argument("--qty", type=int, default=1)
    s.add_argument("--equip", action="store_true"); s.add_argument("--instance-id"); s.add_argument("--mint", action="store_true"); s.add_argument("--replace", action="store_true")
    s.set_defaults(func=cmd_grant)

    s = sub.add_parser("validate-items", help="Validate items/instances/inventory"); s.set_defaults(func=cmd_validate_items)
    s = sub.add_parser("items-export", help="Export items to JSON"); s.add_argument("--file", required=True); s.add_argument("--type"); s.add_argument("--rarity"); s.set_defaults(func=cmd_items_export)
    s = sub.add_parser("items-import", help="Import items from JSON"); s.add_argument("--file", required=True); s.set_defaults(func=cmd_items_import)
    s = sub.add_parser("bulk-grant", help="Grant item or kit to many characters"); s.add_argument("--all-active", action="store_true"); s.add_argument("--email"); s.add_argument("--char-name"); s.add_argument("--item-id"); s.add_argument("--qty", type=int, default=1); s.add_argument("--equip", action="store_true"); s.add_argument("--slot-start", type=int, default=0); s.add_argument("--kit-file"); s.set_defaults(func=cmd_bulk_grant)

    # World helpers (kept)
    s = sub.add_parser("seed-world", help="Generate demo shard JSON")
    s.add_argument("--count", type=int, default=2); s.add_argument("--prefix", default="demo"); s.add_argument("--out-dir")
    s.add_argument("--width", type=int, default=64); s.add_argument("--height", type=int, default=64)
    s.add_argument("--seed", type=int); s.add_argument("--overwrite", action="store_true"); s.add_argument("--assign-email")
    s.set_defaults(func=cmd_seed_world)

    s = sub.add_parser("list-shards", help="List shard JSON files"); s.add_argument("--dir"); s.set_defaults(func=cmd_list_shards)

    return p

def main():
    app = create_app()
    with app.app_context():
        args = build_parser().parse_args()
        args.func(args)

if __name__ == "__main__":
    main()
