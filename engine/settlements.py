"""Settlement helpers and upgrade utilities.

The project previously stored settlement-like information in various places
such as ``pois``.  This module introduces a canonical ``settlements`` array on
the shard payload.  Upgrades are non-destructive: existing keys are preserved
and only missing fields are filled with sensible defaults.  Nested objects are
deep-merged and lists are de-duplicated.  A tiny version marker is recorded so
future schema changes can follow the same policy.
"""

from __future__ import annotations

from typing import Dict, Any, List

# ---------- Schema / Defaults ----------

SETTLEMENT_SCHEMA_VERSION = 1

# footprint by tier (T1/T2=1x1, T3/T4=2x2, T5=4x4)
TIER_FOOTPRINT = {1: (1, 1), 2: (1, 1), 3: (2, 2), 4: (2, 2), 5: (4, 4)}

DEFAULT_SETTLEMENT = {
    "id": None,            # derived from position if missing
    "name": None,
    "tier": 1,
    "anchor": {"x": 0, "y": 0},
    "footprint": {"w": 1, "h": 1},
    "faction_id": None,
    "population": None,
    "links": {"roads": [], "shardgates": []},
    "discovered": False,
    "template_slug": None,
    "variant": None,
    "meta": {},
    "style": {},
}

LEGACY_TYPES = {"city", "town", "village", "port", "settlement"}

# ---------- Helpers ----------

def _dedupe_list(items: List[Any]) -> List[Any]:
    seen = set()
    out = []
    for it in items or []:
        marker = repr(it)
        if marker not in seen:
            seen.add(marker)
            out.append(it)
    return out


def _deep_merge(dest: Dict[str, Any], src: Dict[str, Any], prefer_src: bool = False) -> Dict[str, Any]:
    """Deep merge ``src`` into ``dest``.

    ``prefer_src`` decides which side wins for non-dict/list values.  ``False``
    means existing ``dest`` values are kept; ``True`` means ``src`` overrides.
    Lists are concatenated with de-duplication.
    """
    for k, v in src.items():
        if k in dest:
            dv = dest[k]
            if isinstance(dv, dict) and isinstance(v, dict):
                _deep_merge(dv, v, prefer_src)
            elif isinstance(dv, list) and isinstance(v, list):
                dest[k] = _dedupe_list((dv if not prefer_src else []) + v + (dv if prefer_src else []))
            else:
                if prefer_src:
                    dest[k] = v
        else:
            dest[k] = v
    return dest


def _derive_id(x: int, y: int, existing: set[str]) -> str:
    base = f"sett_{x}_{y}"
    if base not in existing:
        existing.add(base)
        return base
    idx = 1
    while f"{base}_{idx}" in existing:
        idx += 1
    new_id = f"{base}_{idx}"
    existing.add(new_id)
    return new_id


def _ensure_footprint(s: Dict[str, Any]) -> None:
    tier = int(s.get("tier", 1))
    if tier not in TIER_FOOTPRINT:
        tier = 1
        s["tier"] = tier
    exp_w, exp_h = TIER_FOOTPRINT[tier]
    fp = s.get("footprint") or {}
    if fp.get("w") != exp_w or fp.get("h") != exp_h:
        s["footprint"] = {"w": exp_w, "h": exp_h}


def upgrade_settlements(data: Dict[str, Any]) -> Dict[str, Any]:
    """Upgrade ``data`` in-place to ensure canonical ``settlements`` array.

    Returns ``data`` for convenience.  An ``_upgrade_report`` entry is attached
    summarising the work done.
    """
    report = {"upgraded": 0, "added_keys": {}, "collisions": []}

    settlements = data.get("settlements")
    if not isinstance(settlements, list):
        settlements = []
    data["settlements"] = settlements

    existing_ids: set[str] = set()

    # First pass: normalise existing settlements
    for s in settlements:
        _deep_merge(s, DEFAULT_SETTLEMENT, prefer_src=False)
        # derive/clean id
        anchor = s.get("anchor") or {}
        x = int(anchor.get("x", 0))
        y = int(anchor.get("y", 0))
        if not s.get("id"):
            s["id"] = _derive_id(x, y, existing_ids)
        elif s["id"] in existing_ids:
            new_id = _derive_id(x, y, existing_ids)
            report["collisions"].append({"old": s["id"], "new": new_id})
            s["id"] = new_id
        else:
            existing_ids.add(s["id"])
        _ensure_footprint(s)
        report["upgraded"] += 1

    # Second pass: merge legacy POIs
    pois = data.get("pois") or []
    for p in pois:
        ptype = str(p.get("type", "")).lower()
        if ptype not in LEGACY_TYPES:
            continue
        x = int(p.get("x", (p.get("pos") or [0, 0])[0]))
        y = int(p.get("y", (p.get("pos") or [0, 0])[1]))
        sid = _derive_id(x, y, existing_ids)
        entry = {
            "id": sid,
            "name": p.get("name"),
            "tier": 1,
            "anchor": {"x": x, "y": y},
        }
        _deep_merge(entry, DEFAULT_SETTLEMENT, prefer_src=False)
        settlements.append(entry)
        report["upgraded"] += 1

    data["settlements_schema_version"] = SETTLEMENT_SCHEMA_VERSION
    data["_upgrade_report"] = report
    return data


def getSettlements(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the upgraded settlements list."""
    return upgrade_settlements(data)["settlements"]


def upsertSettlement(data: Dict[str, Any], entry: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a settlement by ``id``.

    ``entry`` values take precedence over existing ones.
    Returns the canonical settlement dict.
    """
    settlements = getSettlements(data)
    sid = entry.get("id")
    if not sid:
        anchor = entry.get("anchor") or {}
        x = int(anchor.get("x", 0))
        y = int(anchor.get("y", 0))
        sid = _derive_id(x, y, {s["id"] for s in settlements})
        entry["id"] = sid
    existing = next((s for s in settlements if s["id"] == sid), None)
    if existing:
        _deep_merge(existing, entry, prefer_src=True)
        _ensure_footprint(existing)
        return existing
    _deep_merge(entry, DEFAULT_SETTLEMENT, prefer_src=False)
    _ensure_footprint(entry)
    settlements.append(entry)
    return entry


def removeSettlement(data: Dict[str, Any], sid: str) -> bool:
    """Remove settlement with ``sid``.  Also drop matching legacy POIs."""
    settlements = getSettlements(data)
    removed = False
    for i in range(len(settlements) - 1, -1, -1):
        if settlements[i].get("id") == sid:
            settlements.pop(i)
            removed = True
    pois = data.get("pois") or []
    for i in range(len(pois) - 1, -1, -1):
        p = pois[i]
        if str(p.get("id")) == sid:
            pois.pop(i)
            removed = True
    return removed
