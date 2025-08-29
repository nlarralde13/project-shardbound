# app/classes_admin.py
import os, json, shutil, datetime as dt
from pathlib import Path
from flask import Blueprint, jsonify, request
from flask_login import login_required
from werkzeug.exceptions import BadRequest

classes_admin_bp = Blueprint("classes_admin_bp", __name__, url_prefix="/api/classes-admin")

# --- content layout ---
BASE_DIR = Path(__file__).resolve().parents[1]  # project root
CONTENT  = BASE_DIR / "content"
SCHEMAS  = CONTENT / "schemas"
DRAFTS   = CONTENT / "classes" / "drafts"
PUBS     = CONTENT / "classes" / "published"
CLASS_SCHEMA_PATH = SCHEMAS / "class.schema.json"

DEFAULT_CLASS_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Class Definition",
  "type": "object",
  "additionalProperties": False,
  "properties": {
    "class_id": {"type":"string","pattern":"^[a-z0-9_\\-]{2,64}$"},
    "version":  {"type":"string","pattern":"^[0-9]+\\.[0-9]+\\.[0-9]+$"},
    "name":     {"type":"string","minLength":1},
    "description":{"type":"string"},
    "tags":{"type":"array","items":{"type":"string"}},
    "level_cap":{"type":"integer","minimum":1,"maximum":200},
    "allowed_races":{"type":"array","items":{"type":"string"}},
    "base_attributes":{
      "type":"object","additionalProperties":False,
      "properties":{
        "str":{"type":"integer","minimum":1,"maximum":30},
        "dex":{"type":"integer","minimum":1,"maximum":30},
        "int":{"type":"integer","minimum":1,"maximum":30},
        "wis":{"type":"integer","minimum":1,"maximum":30},
        "con":{"type":"integer","minimum":1,"maximum":30},
        "cha":{"type":"integer","minimum":1,"maximum":30}
      },
      "required":["str","dex","int","wis","con","cha"]
    },
    "per_level_gains":{
      "type":"object","additionalProperties":False,
      "properties":{
        "hp":{"type":"integer","minimum":0,"maximum":1000},
        "mp":{"type":"integer","minimum":0,"maximum":1000},
        "stamina":{"type":"integer","minimum":0,"maximum":1000},
        "stat_points":{"type":"integer","minimum":0,"maximum":10}
      },
      "required":["hp","mp","stamina","stat_points"]
    },
    "skills":{
      "type":"object",
      "additionalProperties":{
        "type":"object",
        "properties":{"start":{"type":"number"},"per_level":{"type":"number"}},
        "required":["start","per_level"],"additionalProperties":False
      }
    },
    "abilities":{
      "type":"array",
      "items":{
        "type":"object","additionalProperties":False,
        "properties":{
          "ability_id":{"type":"string"},
          "name":{"type":"string"},
          "unlock_level":{"type":"integer","minimum":1},
          "rank_cap":{"type":"integer","minimum":1,"maximum":10},
          "scaling":{
            "type":"object","additionalProperties":False,
            "properties":{"stat":{"type":"string","enum":["str","dex","int","wis","con","cha"]},"factor":{"type":"number","minimum":0}},
            "required":["stat","factor"]
          }
        },
        "required":["ability_id","name","unlock_level","rank_cap","scaling"]
      }
    },
    "starting_equipment":{"type":"array","items":{"type":"string"}},
    "notes":{"type":"string"},
    "created_at":{"type":"string"},
    "updated_at":{"type":"string"}
  },
  "required":["class_id","version","name","level_cap","base_attributes","per_level_gains","abilities"]
}

def _ensure_tree():
    for p in (CONTENT, SCHEMAS, DRAFTS, PUBS):
        p.mkdir(parents=True, exist_ok=True)
    if not CLASS_SCHEMA_PATH.exists():
        CLASS_SCHEMA_PATH.write_text(json.dumps(DEFAULT_CLASS_SCHEMA, indent=2), encoding="utf-8")

def _now(): return dt.datetime.utcnow().isoformat() + "Z"
def _draft(cid): return DRAFTS / f"{cid}.json"
def _pub(cid):   return PUBS / f"{cid}.json"

def _load_json(p:Path):
    return json.loads(p.read_text("utf-8"))

def _write_json(p:Path, data:dict):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _bump(ver:str, part:str):
    try:
        major, minor, patch = [int(x) for x in ver.split(".")]
    except Exception:
        major, minor, patch = 0, 1, 0
    if part == "major": major, minor, patch = major+1, 0, 0
    elif part == "minor": minor, patch = minor+1, 0
    else: patch += 1
    return f"{major}.{minor}.{patch}"

def _validate(data:dict):
    try:
        import jsonschema
    except Exception:
        return False, "jsonschema not installed on server (pip install jsonschema)"
    try:
        schema = json.loads(CLASS_SCHEMA_PATH.read_text("utf-8"))
    except Exception as e:
        return False, f"schema missing or invalid: {e}"
    try:
        jsonschema.validate(instance=data, schema=schema)
        return True, None
    except Exception as e:
        return False, str(e)

@classes_admin_bp.route("/init", methods=["POST"])
@login_required
def init_content():
    _ensure_tree()
    return jsonify(ok=True), 200

@classes_admin_bp.route("/list", methods=["GET"])
@login_required
def list_classes():
    _ensure_tree()
    status = request.args.get("status", "all")
    rows = []
    if status in ("all","draft"):
        for p in sorted(DRAFTS.glob("*.json")):
            try:
                d = _load_json(p)
                rows.append({"status":"draft","class_id":d["class_id"],"name":d.get("name"),"version":d.get("version"),"updated_at":d.get("updated_at")})
            except Exception:
                continue
    if status in ("all","published"):
        for p in sorted(PUBS.glob("*.json")):
            try:
                d = _load_json(p)
                rows.append({"status":"published","class_id":d["class_id"],"name":d.get("name"),"version":d.get("version"),"updated_at":d.get("updated_at")})
            except Exception:
                continue
    return jsonify(rows), 200

@classes_admin_bp.route("/get/<cid>", methods=["GET"])
@login_required
def get_class(cid):
    _ensure_tree()
    prefer = request.args.get("prefer","draft")
    p = _draft(cid) if prefer=="draft" and _draft(cid).exists() else _pub(cid)
    if not p.exists():
        return jsonify(error="Not found"), 404
    data = _load_json(p)
    return jsonify({"status":"draft" if p.parent.name=="drafts" else "published","data":data}), 200

@classes_admin_bp.route("/new", methods=["POST"])
@login_required
def new_class():
    _ensure_tree()
    data = request.get_json(force=True) or {}
    cid = (data.get("class_id") or "").strip()
    name = (data.get("name") or "").strip()
    if not cid or not name:
        raise BadRequest("class_id and name required")

    if _draft(cid).exists() or _pub(cid).exists():
        return jsonify(error="Class already exists"), 409

    races = data.get("allowed_races") or []
    level_cap = int(data.get("level_cap") or 60)

    draft = {
        "class_id": cid,
        "version": "0.1.0",
        "name": name,
        "description": data.get("description") or f"Describe the {name} class…",
        "tags": data.get("tags") or [],
        "level_cap": level_cap,
        "allowed_races": races,
        "base_attributes": data.get("base_attributes") or {"str":10,"dex":10,"int":10,"wis":10,"con":10,"cha":10},
        "per_level_gains": data.get("per_level_gains") or {"hp":5,"mp":2,"stamina":3,"stat_points":1},
        "skills": data.get("skills") or {"athletics":{"start":2,"per_level":1}},
        "abilities": data.get("abilities") or [
          {"ability_id":"slash","name":"Slash","unlock_level":1,"rank_cap":3,"scaling":{"stat":"str","factor":1.1}}
        ],
        "starting_equipment": data.get("starting_equipment") or ["leather_jerkin_001","rusty_blade_001"],
        "notes": data.get("notes") or "",
        "created_at": _now(),
        "updated_at": _now()
    }
    _write_json(_draft(cid), draft)
    return jsonify(ok=True, status="draft", data=draft), 201

@classes_admin_bp.route("/save", methods=["PATCH","POST"])
@login_required
def save_class():
    _ensure_tree()
    body = request.get_json(force=True) or {}
    cid = (body.get("class_id") or "").strip()
    status = body.get("status") or "draft"
    doc = body.get("data") or {}
    if not cid or not isinstance(doc, dict):
        raise BadRequest("class_id and data required")

    p = _draft(cid) if status=="draft" else _pub(cid)
    if not p.exists():
        return jsonify(error="Not found"), 404

    doc["class_id"] = cid
    doc["updated_at"] = _now()
    # optional validate=1
    if str(body.get("validate","0")) in ("1","true","True"):
        ok, err = _validate(doc)
        if not ok:
            return jsonify(error="validation_failed", detail=err), 400

    _write_json(p, doc)
    return jsonify(ok=True, status=status, data=doc), 200

@classes_admin_bp.route("/validate", methods=["POST"])
@login_required
def validate_class():
    _ensure_tree()
    body = request.get_json(force=True) or {}
    if "data" in body:
        doc = body["data"]
    else:
        cid = (body.get("class_id") or "").strip()
        status = body.get("status") or "draft"
        p = _draft(cid) if status=="draft" else _pub(cid)
        if not p.exists():
            return jsonify(error="Not found"), 404
        doc = _load_json(p)
    ok, err = _validate(doc)
    return (jsonify(ok=True), 200) if ok else (jsonify(error="validation_failed", detail=err), 400)

@classes_admin_bp.route("/publish", methods=["POST"])
@login_required
def publish_class():
    _ensure_tree()
    body = request.get_json(force=True) or {}
    cid = (body.get("class_id") or "").strip()
    bump = (body.get("bump") or "patch").lower()
    force = bool(body.get("force", False))

    dpath = _draft(cid)
    if not dpath.exists():
        return jsonify(error="Draft not found"), 404
    doc = _load_json(dpath)
    # validate before publish
    ok, err = _validate(doc)
    if not ok:
        return jsonify(error="validation_failed", detail=err), 400

    doc["version"] = _bump(doc.get("version","0.1.0"), bump)
    doc["updated_at"] = _now()
    ppath = _pub(cid)
    if ppath.exists() and not force:
        return jsonify(error="Already published (use force)"), 409
    _write_json(ppath, doc)
    return jsonify(ok=True, status="published", data=doc), 200

@classes_admin_bp.route("/yank", methods=["POST"])
@login_required
def yank_class():
    _ensure_tree()
    body = request.get_json(force=True) or {}
    cid = (body.get("class_id") or "").strip()
    ppath = _pub(cid)
    if not ppath.exists():
        return jsonify(error="Published not found"), 404
    dpath = _draft(cid)
    shutil.move(str(ppath), str(dpath))
    return jsonify(ok=True, status="draft"), 200
