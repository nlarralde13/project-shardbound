import hashlib
import logging
from typing import Dict, Any

from api.models import db, CharacterEquipped, ItemInstance, Item

logger = logging.getLogger(__name__)


def compute_derived_stats(character_id: str) -> Dict[str, Any]:
    rows = (
        db.session.query(CharacterEquipped)
        .filter_by(character_id=character_id)
        .all()
    )
    totals: Dict[str, float] = {}
    effects = []
    ids = []
    for ce in rows:
        inst = ItemInstance.query.get(ce.item_instance_id)
        if not inst:
            continue
        tmpl = Item.query.get(inst.item_id)
        ids.append(ce.item_instance_id)
        stats = getattr(tmpl, "stats", {}) or {}
        tags = getattr(tmpl, "tags", []) or []
        for stat, val in stats.items():
            try:
                num = float(val)
            except Exception:
                continue
            totals[stat] = totals.get(stat, 0) + num
            effects.append({
                "id": f"{tmpl.item_id}:{stat}",
                "scope": "character",
                "stat": stat,
                "op": "add",
                "value": num,
                "tags": tags,
                "duration": "passive",
            })
    return {"stats": totals, "effects": effects}


def build_snapshot(character_id: str) -> Dict[str, Any]:
    data = compute_derived_stats(character_id)
    ids = sorted(
        ce.item_instance_id for ce in db.session.query(CharacterEquipped).filter_by(character_id=character_id)
    )
    sources_hash = hashlib.sha1(";".join(ids).encode()).hexdigest() if ids else ""
    data["sources_hash"] = sources_hash
    logger.info(
        "snapshot_rebuild character_id=%s sources_hash=%s changed_stats_count=%s",
        character_id,
        sources_hash,
        len(data.get("stats", {})),
    )
    return data
