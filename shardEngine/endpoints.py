# /app/shardEngine/endpoints.py 
from __future__ import annotations

from flask import Blueprint, request, jsonify
from datetime import datetime
import hashlib
from typing import Any, Dict

from .schemas import (
    PlanRequest,
)
from .registry import Registry, overrides_hash_sha1
from . import generator_v2 as gen
print("[v2] shardEngine.endpoints imported")

bp = Blueprint("shard_gen_v2", __name__)
print("[v2] blueprint object created:", bp.name)



def _iso_now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


@bp.route("/", methods=["GET"])
def info():
    return jsonify({
        "ok": True,
        "generator": "v2",
        "routes": {
            "plan": "POST /api/shard-gen-v2/plan",
            "generate": "POST /api/shard-gen-v2/generate"
        }
    })

@bp.route("/plan", methods=["POST"])
def plan_endpoint():
    body = request.get_json(silent=True) or {}
    try:
        req = PlanRequest(**body)
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid request: {e}"}), 400

    reg = Registry()
    try:
        reg.load_all()
    except Exception as e:
        return jsonify({"ok": False, "error": f"registry load failed: {e}"}), 500

    try:
        tier_doc = reg.get_tier_doc(req.templateId)
        tier = tier_doc.data
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    overrides_dict: Dict[str, Any] = {}
    if req.overrides is not None:
        try:
            overrides_dict = req.overrides.model_dump(exclude_none=True)  # pydantic v2
        except Exception:
            overrides_dict = req.overrides.dict(exclude_none=True)        # pydantic v1

    merged_tier, diff = reg.apply_overrides_strict(tier, overrides_dict)

    biome_pack_id = req.biomePack or merged_tier.get("biomes", {}).get("pack")
    if not biome_pack_id:
        return jsonify({"ok": False, "error": "biome pack not specified in tier or request"}), 400
    try:
        biome_doc = reg.get_biome_doc(biome_pack_id)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    # seed: use provided or derive deterministically from name+template+overrides
    if req.seed is not None:
        seed = int(req.seed)
    else:
        basis = f"{req.name}|{req.templateId}|{overrides_hash_sha1(overrides_dict)}".encode("utf-8")
        seed = int.from_bytes(hashlib.blake2s(basis, digest_size=4).digest(), "big") % 100_000_000

    try:
        plan = gen.plan(
            req=req,
            merged_tier=merged_tier,
            tier_prov=tier_doc.id_at_version,
            biome_doc=biome_doc,
            seed=seed,
            diff=diff,
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"planner error: {e}"}), 500

    try:
        payload = plan.model_dump()  # pydantic v2
    except Exception:
        payload = plan.dict()        # pydantic v1

    return jsonify(payload), 200


@bp.route("/generate", methods=["POST"])
def generate_endpoint():
    body = request.get_json(silent=True) or {}
    try:
        req = PlanRequest(**body)
    except Exception as e:
        return jsonify({"ok": False, "error": f"invalid request: {e}"}), 400

    reg = Registry()
    try:
        reg.load_all()
    except Exception as e:
        return jsonify({"ok": False, "error": f"registry load failed: {e}"}), 500

    try:
        tier_doc = reg.get_tier_doc(req.templateId)
        tier = tier_doc.data
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    overrides_dict = {}
    if req.overrides is not None:
        try:
            overrides_dict = req.overrides.model_dump(exclude_none=True)
        except Exception:
            overrides_dict = req.overrides.dict(exclude_none=True)

    merged_tier, _diff = reg.apply_overrides_strict(tier, overrides_dict)

    biome_pack_id = req.biomePack or merged_tier.get("biomes", {}).get("pack")
    if not biome_pack_id:
        return jsonify({"ok": False, "error": "biome pack not specified in tier or request"}), 400
    try:
        biome_doc = reg.get_biome_doc(biome_pack_id)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    # seed: if provided, use it; else derive from name+template+overrides (same as /plan)
    if req.seed is not None:
        seed = int(req.seed)
    else:
        import hashlib
        basis = f"{req.name}|{req.templateId}|{overrides_hash_sha1(overrides_dict)}".encode("utf-8")
        seed = int.from_bytes(hashlib.blake2s(basis, digest_size=4).digest(), "big") % 100_000_000

    try:
        out = gen.generate(
            req=req,
            merged_tier=merged_tier,
            tier_prov=tier_doc.id_at_version,
            biome_doc=biome_doc,
            seed=seed,
        )
    except Exception as e:
        return jsonify({"ok": False, "error": f"generate error: {e}"}), 500

    return jsonify({"ok": True, **out}), 200

