# tools/class_builder.py
# Content-first Class Builder for Shardbound
# ------------------------------------------------------------
# Examples (from project root, inside venv):
#   python tools/class_builder.py init-content
#   python tools/class_builder.py new --id warrior --name "Warrior" --level-cap 60 --races human,elf
#   python tools/class_builder.py list
#   python tools/class_builder.py show --id warrior
#   python tools/class_builder.py validate --id warrior
#   python tools/class_builder.py publish --id warrior --bump minor
#   python tools/class_builder.py draft --id warrior  # move published -> drafts (yank)
#   python tools/class_builder.py sync-db             # optional, only if you add a `class_def` table later

import os, sys, json, argparse, shutil, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
SCHEMAS = CONTENT / "schemas"
DRAFTS = CONTENT / "classes" / "drafts"
PUBS   = CONTENT / "classes" / "published"

# Optional DB integration (won't be used unless present)
def _maybe_load_app():
    try:
        sys.path.insert(0, str(ROOT))
        from api import create_app  # type: ignore
        from api.models import db   # type: ignore
        return create_app, db
    except Exception:
        return None, None

def ensure_tree():
    (CONTENT).mkdir(parents=True, exist_ok=True)
    (SCHEMAS).mkdir(parents=True, exist_ok=True)
    (DRAFTS).mkdir(parents=True, exist_ok=True)
    (PUBS).mkdir(parents=True, exist_ok=True)

CLASS_SCHEMA_PATH = SCHEMAS / "class.schema.json"

def _load_schema():
    try:
        import jsonschema  # type: ignore
    except Exception:
        print("jsonschema not installed. Install with:\n  python -m pip install jsonschema")
        sys.exit(1)
    if not CLASS_SCHEMA_PATH.exists():
        print(f"Missing schema at {CLASS_SCHEMA_PATH}. Run `init-content` first.")
        sys.exit(1)
    schema = json.loads(CLASS_SCHEMA_PATH.read_text("utf-8"))
    return jsonschema, schema

def _draft_path(cid:str): return DRAFTS / f"{cid}.json"
def _pub_path(cid:str):   return PUBS   / f"{cid}.json"

def _read_json(p:Path):
    return json.loads(p.read_text("utf-8"))

def _write_json(p:Path, data:dict):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _now_iso():
    return dt.datetime.utcnow().isoformat() + "Z"

def _bump(ver:str, part:str):
    try:
        major, minor, patch = [int(x) for x in ver.split(".")]
    except Exception:
        major, minor, patch = 0,0,0
    if part == "major": major, minor, patch = major+1, 0, 0
    elif part == "minor": minor, patch = minor+1, 0
    else: patch += 1
    return f"{major}.{minor}.{patch}"

# ------------------- commands -------------------

def cmd_init(_):
    ensure_tree()
    # write schemas if missing
    if not CLASS_SCHEMA_PATH.exists():
        CLASS_SCHEMA_PATH.write_text(DEFAULT_CLASS_SCHEMA, encoding="utf-8")
        print(f"Wrote {CLASS_SCHEMA_PATH}")
    print("Content folders ready:")
    print(" -", DRAFTS)
    print(" -", PUBS)

def cmd_new(args):
    ensure_tree()
    cid = (args.id or "").strip()
    name = (args.name or "").strip()
    if not cid or not name:
        print("Provide --id and --name"); sys.exit(1)
    draft = _draft_path(cid)
    if draft.exists():
        print(f"Draft already exists: {draft}"); sys.exit(1)
    races = [r.strip() for r in (args.races or "").split(",") if r.strip()]
    level_cap = int(args.level_cap or 60)

    data = {
      "class_id": cid,
      "version": "0.1.0",
      "name": name,
      "description": f"Describe the {name} class...",
      "tags": ["melee"] if "warrior" in cid.lower() else [],
      "level_cap": level_cap,
      "allowed_races": races,
      "base_attributes": {"str":10,"dex":10,"int":10,"wis":10,"con":10,"cha":10},
      "per_level_gains": {"hp":5,"mp":2,"stamina":3,"stat_points":1},
      "skills": {
        "athletics": {"start": 2, "per_level": 1},
        "survival": {"start": 1, "per_level": 0.5}
      },
      "abilities": [
        {"ability_id":"slash","name":"Slash","unlock_level":1,"rank_cap":3,"scaling":{"stat":"str","factor":1.1}},
        {"ability_id":"heavy_strike","name":"Heavy Strike","unlock_level":3,"rank_cap":3,"scaling":{"stat":"str","factor":1.3}}
      ],
      "starting_equipment": ["leather_jerkin_001","rusty_blade_001"],
      "notes": "",
      "created_at": _now_iso(),
      "updated_at": _now_iso()
    }
    _write_json(draft, data)
    print(f"New class draft created: {draft}")

def cmd_list(_):
    ensure_tree()
    rows = []
    for p in sorted(DRAFTS.glob("*.json")):
        d = _read_json(p)
        rows.append(("draft", d["class_id"], d.get("name","?"), d.get("version","?")))
    for p in sorted(PUBS.glob("*.json")):
        d = _read_json(p)
        rows.append(("published", d["class_id"], d.get("name","?"), d.get("version","?")))
    if not rows:
        print("(no classes)")
        return
    w1 = max(len(r[0]) for r in rows + [("status",)])
    w2 = max(len(r[1]) for r in rows + [("class_id",)])
    w3 = max(len(r[2]) for r in rows + [("name",)])
    print("status".ljust(w1), " | ", "class_id".ljust(w2), " | ", "name".ljust(w3), " | version")
    print("-"*w1, "-|-", "-"*w2, "-|-", "-"*w3, "-|---------")
    for r in rows:
        print(r[0].ljust(w1), " | ", r[1].ljust(w2), " | ", r[2].ljust(w3), " | ", r[3])

def _load_by_id(cid):
    d = _draft_path(cid); p = _pub_path(cid)
    if d.exists(): return _read_json(d), d, "draft"
    if p.exists(): return _read_json(p), p, "published"
    print(f"Class not found: {cid}"); sys.exit(1)

def cmd_show(args):
    data, path, status = _load_by_id(args.id)
    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return
    print(f"[{status}] {path.name}")
    print(f"class_id: {data['class_id']}")
    print(f"name:     {data.get('name')}")
    print(f"version:  {data.get('version')}")
    print(f"tags:     {', '.join(data.get('tags') or [])}")
    print(f"level_cap:{data.get('level_cap')}")
    print(f"races:    {', '.join(data.get('allowed_races') or [])}")
    print(f"abilities:")
    for a in data.get("abilities", []):
        print(f"  - {a.get('ability_id')} (lvl {a.get('unlock_level')} cap {a.get('rank_cap')})")

def cmd_validate(args):
    jsonschema, schema = _load_schema()
    data, path, status = _load_by_id(args.id)
    try:
        jsonschema.validate(instance=data, schema=schema)
        print(f"OK: {path}")
    except jsonschema.ValidationError as e:
        print(f"Invalid: {path}\n -> {e.message}\n at {list(e.path)}")
        sys.exit(2)

def cmd_publish(args):
    ensure_tree()
    jsonschema, schema = _load_schema()
    draft = _draft_path(args.id)
    if not draft.exists():
        print(f"No draft at {draft}"); sys.exit(1)
    data = _read_json(draft)
    # bump version if requested
    bump = (args.bump or "patch").lower()
    if bump not in ("major","minor","patch"): bump = "patch"
    data["version"] = _bump(data.get("version","0.1.0"), bump)
    data["updated_at"] = _now_iso()

    # validate
    jsonschema.validate(instance=data, schema=schema)

    pub = _pub_path(args.id)
    if pub.exists() and not args.force:
        print(f"Published already exists: {pub} (use --force to overwrite)"); sys.exit(1)
    _write_json(pub, data)
    print(f"Published -> {pub}")

def cmd_draft(args):
    """Move a published class back to drafts (yank)."""
    pub = _pub_path(args.id)
    if not pub.exists():
        print(f"No published file at {pub}"); sys.exit(1)
    draft = _draft_path(args.id)
    shutil.move(str(pub), str(draft))
    print(f"Moved to drafts: {draft}")

def cmd_sync_db(_):
    """Optional: push published classes into DB table `class_def` if you add it later."""
    create_app, db = _maybe_load_app()
    if not create_app or not db:
        print("App/DB not importable. Skipping.")
        return
    # Attempt to import ClassDef; if you add this model later, it will work.
    try:
        from api.models import ClassDef  # type: ignore
    except Exception:
        print("No ClassDef model found. Add one to models.py if you want DB sync.")
        return

    app = create_app()
    with app.app_context():
        count = 0
        for p in PUBS.glob("*.json"):
            data = _read_json(p)
            cid = data["class_id"]
            row = ClassDef.query.filter_by(class_id=cid).first()
            if not row:
                row = ClassDef(class_id=cid, name=data.get("name"), version=data.get("version"), payload=data, is_active=True)
                db.session.add(row)
            else:
                row.name = data.get("name")
                row.version = data.get("version")
                row.payload = data
                row.is_active = True
            count += 1
        db.session.commit()
        print(f"Synchronized {count} classes to DB.")

def build_parser():
    p = argparse.ArgumentParser(description="Class content builder")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init-content", help="Create content folders and write schemas")
    s.set_defaults(func=cmd_init)

    s = sub.add_parser("new", help="Create a new class draft")
    s.add_argument("--id", required=True, help="class_id, e.g. warrior")
    s.add_argument("--name", required=True, help="Display name")
    s.add_argument("--level-cap", type=int, help="Max level (default 60)")
    s.add_argument("--races", help="Comma-separated allowed races")
    s.set_defaults(func=cmd_new)

    s = sub.add_parser("list", help="List draft/published classes")
    s.set_defaults(func=cmd_list)

    s = sub.add_parser("show", help="Show one class")
    s.add_argument("--id", required=True)
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_show)

    s = sub.add_parser("validate", help="Validate a class draft/published against schema")
    s.add_argument("--id", required=True)
    s.set_defaults(func=cmd_validate)

    s = sub.add_parser("publish", help="Promote draft -> published")
    s.add_argument("--id", required=True)
    s.add_argument("--bump", choices=["major","minor","patch"], default="patch")
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=cmd_publish)

    s = sub.add_parser("draft", help="Move published back to drafts (yank)")
    s.add_argument("--id", required=True)
    s.set_defaults(func=cmd_draft)

    s = sub.add_parser("sync-db", help="(Optional) Sync published classes to DB if ClassDef model exists")
    s.set_defaults(func=cmd_sync_db)

    return p

DEFAULT_CLASS_SCHEMA = r"""
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Class Definition",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "class_id": { "type": "string", "pattern": "^[a-z0-9_\\-]{2,64}$" },
    "version":  { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" },
    "name":     { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "level_cap": { "type": "integer", "minimum": 1, "maximum": 200 },
    "allowed_races": { "type": "array", "items": { "type": "string" } },
    "base_attributes": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "str": { "type": "integer", "minimum": 1, "maximum": 30 },
        "dex": { "type": "integer", "minimum": 1, "maximum": 30 },
        "int": { "type": "integer", "minimum": 1, "maximum": 30 },
        "wis": { "type": "integer", "minimum": 1, "maximum": 30 },
        "con": { "type": "integer", "minimum": 1, "maximum": 30 },
        "cha": { "type": "integer", "minimum": 1, "maximum": 30 }
      },
      "required": ["str","dex","int","wis","con","cha"]
    },
    "per_level_gains": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "hp": { "type": "integer", "minimum": 0, "maximum": 1000 },
        "mp": { "type": "integer", "minimum": 0, "maximum": 1000 },
        "stamina": { "type": "integer", "minimum": 0, "maximum": 1000 },
        "stat_points": { "type": "integer", "minimum": 0, "maximum": 10 }
      },
      "required": ["hp","mp","stamina","stat_points"]
    },
    "skills": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "start": { "type": "number" },
          "per_level": { "type": "number" }
        },
        "required": ["start","per_level"],
        "additionalProperties": false
      }
    },
    "abilities": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "ability_id": { "type": "string" },
          "name": { "type": "string" },
          "unlock_level": { "type": "integer", "minimum": 1 },
          "rank_cap": { "type": "integer", "minimum": 1, "maximum": 10 },
          "scaling": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "stat": { "type": "string", "enum": ["str","dex","int","wis","con","cha"] },
              "factor": { "type": "number", "minimum": 0 }
            },
            "required": ["stat","factor"]
          }
        },
        "required": ["ability_id","name","unlock_level","rank_cap","scaling"]
      }
    },
    "starting_equipment": { "type": "array", "items": { "type": "string" } },
    "notes": { "type": "string" },
    "created_at": { "type": "string" },
    "updated_at": { "type": "string" }
  },
  "required": ["class_id","version","name","level_cap","base_attributes","per_level_gains","abilities"]
}
"""

def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
