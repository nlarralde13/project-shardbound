"""
Shard Engine v2 - Template Registry
-----------------------------------

Loads tier templates, biome packs, and POI tables from:
  /app/shardEngine/templates/

- catalog.json   : lists available template IDs by category
- tiers/*.json   : tier templates (size, water, hydrology, settlements, roads, poi, resources)
- biomes/*.json  : biome packs (edge rules, coast set, interior weights)
- poi/*.json     : POI tables

Key features:
- Deep-merge overrides with a DIFF report (applied vs ignored keys)
- Strict override policy: unknown keys are IGNORED and recorded
- Minimal validation & helpful errors for DX
- Provenance helpers for "{id}@{version}" strings

This module is *pure* (no Flask, no Pydantic). Endpoint/generator can sit on top.
"""

from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# -------- Exceptions ----------------------------------------------------------

class RegistryError(RuntimeError):
    pass


# -------- Data containers -----------------------------------------------------

@dataclass(frozen=True)
class LoadedDoc:
    """A loaded JSON doc with its id & version extracted (if present)."""
    id: str
    version: str
    data: Dict[str, Any]
    path: Path

    @property
    def id_at_version(self) -> str:
        v = self.version or "0.0.0"
        return f"{self.id}@{v}"


@dataclass
class OverrideDiff:
    """Diff report after applying overrides to a tier template."""
    template_overrides_applied: Dict[str, Any]
    ignored_overrides: List[str]


# -------- Registry ------------------------------------------------------------

class Registry:
    """
    Template registry rooted at /app/shardEngine/templates (by default).

    Usage:
        reg = Registry()  # or Registry(base_dir=Path("/custom/path"))
        reg.load_all()    # loads catalog + referenced docs

        tier = reg.get_tier("normal-16")
        biome = reg.get_biome(tier["biomes"]["pack"])  # resolved pack ID
        poi_tbl = reg.get_poi("ruins-common")

        # Merge overrides onto a tier template (strict; unknown keys -> ignored)
        merged, diff = reg.apply_overrides_strict(tier, {
            "water": {"coast_width": [1, 2]},
            "poi": {"budget": 3},
            "unknown": {"oops": True}
        })
        # diff.template_overrides_applied => {"water.coast_width": [1,2], "poi.budget": 3}
        # diff.ignored_overrides         => ["unknown", "unknown.oops"]
    """

    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir: Path = base_dir or Path(__file__).parent / "templates"
        self._catalog: Optional[Dict[str, Any]] = None
        self._tiers: Dict[str, LoadedDoc] = {}
        self._biomes: Dict[str, LoadedDoc] = {}
        self._poi: Dict[str, LoadedDoc] = {}

    # ----- Load & access ------------------------------------------------------

    def load_all(self) -> None:
        """Load catalog + all tiers/biomes/poi referenced within."""
        catalog = self._load_catalog()
        self._catalog = catalog

        for tid in catalog.get("tiers", []):
            self._tiers[tid] = self._load_doc("tiers", tid)

        for bid in catalog.get("biomes", []):
            self._biomes[bid] = self._load_doc("biomes", bid)

        for pid in catalog.get("poi", []):
            self._poi[pid] = self._load_doc("poi", pid)

    def list_tiers(self) -> List[str]:
        self._ensure_loaded()
        return sorted(self._tiers.keys())

    def list_biomes(self) -> List[str]:
        self._ensure_loaded()
        return sorted(self._biomes.keys())

    def list_poi(self) -> List[str]:
        self._ensure_loaded()
        return sorted(self._poi.keys())

    def get_tier_doc(self, template_id: str) -> LoadedDoc:
        self._ensure_loaded()
        doc = self._tiers.get(template_id)
        if not doc:
            raise RegistryError(f"Tier template not found: {template_id}")
        return doc

    def get_biome_doc(self, biome_id: str) -> LoadedDoc:
        self._ensure_loaded()
        doc = self._biomes.get(biome_id)
        if not doc:
            raise RegistryError(f"Biome pack not found: {biome_id}")
        return doc

    def get_poi_doc(self, poi_id: str) -> LoadedDoc:
        self._ensure_loaded()
        doc = self._poi.get(poi_id)
        if not doc:
            raise RegistryError(f"POI table not found: {poi_id}")
        return doc

    # Shorthand to get underlying data dicts
    def get_tier(self, template_id: str) -> Dict[str, Any]:
        return self.get_tier_doc(template_id).data

    def get_biome(self, biome_id: str) -> Dict[str, Any]:
        return self.get_biome_doc(biome_id).data

    def get_poi(self, poi_id: str) -> Dict[str, Any]:
        return self.get_poi_doc(poi_id).data

    # ----- Overrides (strict) -------------------------------------------------

    def apply_overrides_strict(
        self,
        base: Dict[str, Any],
        overrides: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], OverrideDiff]:
        """
        Deep-merge overrides onto *base*, but ONLY for keys that exist in base.
        Unknown keys are ignored and recorded under diff.ignored_overrides.

        - Types must be compatible (dict->dict, scalar->scalar, list->list).
        - On list overrides, the entire list is replaced (no partial merge).
        - Returns (merged, diff).
        """
        if not overrides:
            return json.loads(json.dumps(base)), OverrideDiff({}, [])

        merged = json.loads(json.dumps(base))  # deep copy
        applied: Dict[str, Any] = {}
        ignored: List[str] = []

        def _merge(dst: Dict[str, Any], src: Dict[str, Any], path: str) -> None:
            for k, v in src.items():
                p = f"{path}.{k}" if path else k
                if k not in dst:
                    ignored.append(p)
                    # If it's a dict, record its subkeys as ignored too
                    if isinstance(v, dict):
                        for subk in _flatten_keys(v, prefix=p):
                            ignored.append(subk)
                    continue

                # Dict -> dict
                if isinstance(dst[k], dict) and isinstance(v, dict):
                    _merge(dst[k], v, p)
                # List -> list (replace entirely)
                elif isinstance(dst[k], list) and isinstance(v, list):
                    dst[k] = json.loads(json.dumps(v))
                    applied[p] = dst[k]
                # Scalar -> scalar (replace)
                elif not isinstance(dst[k], dict) and not isinstance(v, dict):
                    dst[k] = v
                    applied[p] = v
                else:
                    # type mismatch, ignore
                    ignored.append(p)

        _merge(merged, overrides, "")
        return merged, OverrideDiff(applied, _dedup_preserve_order(ignored))

    # ----- Provenance helpers -------------------------------------------------

    def provenance_for_tier(self, template_id: str) -> str:
        doc = self.get_tier_doc(template_id)
        return doc.id_at_version

    def provenance_for_biome(self, biome_id: str) -> str:
        doc = self.get_biome_doc(biome_id)
        return doc.id_at_version

    # ----- Internal loaders ---------------------------------------------------

    def _ensure_loaded(self) -> None:
        if self._catalog is None:
            raise RegistryError("Registry not loaded. Call load_all() first.")

    def _load_catalog(self) -> Dict[str, Any]:
        path = self.base_dir / "catalog.json"
        if not path.exists():
            raise RegistryError(f"Missing catalog.json at {path}")
        try:
            with path.open("r", encoding="utf-8") as f:
                doc = json.load(f)
        except Exception as e:
            raise RegistryError(f"Failed to parse {path}: {e}") from e

        # Minimal validation
        for key in ("tiers", "biomes", "poi"):
            if key not in doc or not isinstance(doc[key], list):
                raise RegistryError(f"catalog.json missing/invalid '{key}' list")
        return doc

    def _load_doc(self, folder: str, doc_id: str) -> LoadedDoc:
        path = self.base_dir / folder / f"{doc_id}.json"
        if not path.exists():
            raise RegistryError(f"Missing {folder} document: {path}")
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise RegistryError(f"Failed to parse {path}: {e}") from e

        if "id" not in data:
            data["id"] = doc_id
        version = str(data.get("version", "1.0.0"))
        if not isinstance(version, str):
            raise RegistryError(f"{path} has non-string version")

        # quick sanity checks for common fields by type
        if folder == "tiers":
            if "grid" not in data or not isinstance(data["grid"], dict):
                raise RegistryError(f"{path} missing 'grid' block")
            if "water" not in data or not isinstance(data["water"], dict):
                raise RegistryError(f"{path} missing 'water' block")

        return LoadedDoc(id=data["id"], version=version, data=data, path=path)


# -------- Utilities -----------------------------------------------------------

def overrides_hash_sha1(overrides: Optional[Dict[str, Any]]) -> str:
    """Stable SHA1 hash for overrides diff/provenance."""
    if not overrides:
        return "sha1:0"
    blob = json.dumps(overrides, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"sha1:{hashlib.sha1(blob).hexdigest()}"


def _flatten_keys(obj: Dict[str, Any], prefix: str = "") -> List[str]:
    """Flatten nested dict keys to 'a.b.c' dotted paths (for ignored reporting)."""
    out: List[str] = []
    for k, v in obj.items():
        p = f"{prefix}.{k}" if prefix else k
        out.append(p)
        if isinstance(v, dict):
            out.extend(_flatten_keys(v, p))
    return out


def _dedup_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out
