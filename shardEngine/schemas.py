# /app/shardEngine/schemas.py
"""
Pydantic models for Shard Engine v2 (plan + generate APIs).

- Compatible with Pydantic v2 (preferred) and v1 (fallback).
- Mirrors the `/api/shard-gen-v2/plan` response contract and request shape.
- Keep this module free of generator logic; it is schemas + light validation only.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Literal
from enum import Enum

# ---- Pydantic v2 preferred, v1 fallback ------------------------------------
try:
    from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
    PydV2 = True
except Exception:  # pragma: no cover
    from pydantic import BaseModel, Field, validator  # type: ignore
    ConfigDict = dict  # type: ignore
    PydV2 = False

def _fv(*names, **kw):
    """Compatibility wrapper for field validators across pydantic v1/v2."""
    if PydV2:
        return field_validator(*names, **kw)  # type: ignore
    # v1: use validator, always allow_reuse
    def deco(fn):
        return validator(*names, allow_reuse=True, **kw)(fn)  # type: ignore
    return deco

# -----------------------------------------------------------------------------

# =========================
# Shared enums & constants
# =========================

class Severity(str, Enum):
    info = "info"
    warning = "warning"
    error = "error"

class PlanVerbosity(str, Enum):
    mini = "mini"
    normal = "normal"
    full = "full"

# =========================
# Request models (v2)
# =========================

class WaterOverrides(BaseModel):
    ocean_ring: Optional[int] = Field(None, ge=0, description="Outer ocean ring thickness in tiles")
    coast_width: Optional[Tuple[int, int]] = Field(
        None, description="[min,max] coast belt thickness"
    )
    target_percent: Optional[float] = Field(None, ge=0.0, le=1.0)

class HydrologyOverrides(BaseModel):
    rivers: Optional[Dict[str, int]] = Field(
        None, description='{"min": int, "max": int}'
    )
    lake_chance: Optional[float] = Field(None, ge=0.0, le=1.0)
    lake_size: Optional[Tuple[int, int]] = None
    merge_confluences: Optional[bool] = None

class SettlementBudget(BaseModel):
    city: Optional[int] = None
    town: Optional[int] = None
    village: Optional[int] = None
    port: Optional[int] = None

class SettlementOverrides(BaseModel):
    budget: Optional[SettlementBudget] = None
    # rules are string flags; keep free-form for now (validated by generator)
    rules: Optional[Dict[str, List[str]]] = None

class RoadsOverrides(BaseModel):
    connectivity: Optional[Literal["mst"]] = None
    bridge: Optional[Dict[str, int]] = Field(
        None, description='{"max_span": int}'
    )

class POIOverrides(BaseModel):
    budget: Optional[int] = None
    min_spacing: Optional[int] = Field(None, ge=0)
    tables: Optional[List[str]] = None

class ResourcesOverrides(BaseModel):
    potentials: Optional[List[str]] = None
    thresholds: Optional[Dict[str, float]] = None
    max_nodes_per_room: Optional[int] = Field(None, ge=0)
    ambient_roll: Optional[bool] = None
    respawn_seconds: Optional[Dict[str, int]] = None

class TemplateOverrides(BaseModel):
    water: Optional[WaterOverrides] = None
    hydrology: Optional[HydrologyOverrides] = None
    settlements: Optional[SettlementOverrides] = None
    roads: Optional[RoadsOverrides] = None
    poi: Optional[POIOverrides] = None
    resources: Optional[ResourcesOverrides] = None

class PlanRequest(BaseModel):
    """
    Request for /api/shard-gen-v2/plan and /generate
    """
    templateId: str = Field(..., description="Tier template id, e.g. 'normal-16'")
    name: str = Field(..., min_length=1, description="Base shard name (used in filename)")
    autoSeed: bool = Field(True, description="If true, server assigns deterministic 8-digit seed")
    seed: Optional[int] = Field(None, ge=0, le=99999999, description="Optional: forced seed")
    biomePack: Optional[str] = Field(None, description="Override biome pack; else from template")
    overrides: Optional[TemplateOverrides] = None
    planVerbosity: PlanVerbosity = Field(PlanVerbosity.normal)

    # Pydantic v2 config
    if PydV2:
        model_config = ConfigDict(extra="ignore")

    @_fv("name")
    def _trim_name(cls, v: str):
        v = v.strip()
        if not v:
            raise ValueError("name cannot be empty")
        return v

    @_fv("seed")
    def _validate_seed(cls, v: Optional[int]):
        if v is None:
            return v
        # 8-digit (or fewer) integer only; generator pads if needed
        return int(v)

# =========================
# Response models (v2 /plan)
# =========================

class GridSpec(BaseModel):
    cols: int = Field(..., ge=1)
    rows: int = Field(..., ge=1)
    tile_size: int = Field(..., ge=1)

class Provenance(BaseModel):
    generator: Literal["v2"] = "v2"
    schema_version: str = "2.0.0"
    template: str = Field(..., description="e.g. 'normal-16@1.0.0'")
    biome_pack: str = Field(..., description="e.g. 'temperate-base@1.0.0'")
    seed: int = Field(..., ge=0, le=99999999)
    overrides_hash: Optional[str] = None
    request_echo: Dict[str, Any] = Field(default_factory=dict)

class DiffBlock(BaseModel):
    template_overrides_applied: Dict[str, Any] = Field(default_factory=dict)
    ignored_overrides: List[str] = Field(default_factory=list)

class BudgetsBlock(BaseModel):
    settlements: Dict[str, int] = Field(default_factory=dict)
    poi: Dict[str, Any] = Field(default_factory=dict)

# ---- layers: water/hydrology/biomes/settlements/roads/poi/resources ----------

class WaterLayerPlan(BaseModel):
    ocean_ring: int
    coast_width: Tuple[int, int]
    coastline_ok: bool
    estimated_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="ocean_tiles, coast_tiles, interior_land_tiles, interior_water_reserve",
    )

class HydrologyRequested(BaseModel):
    rivers_min: int
    rivers_max: int
    lake_chance: float
    lake_size: Tuple[int, int]

class RiverSource(BaseModel):
    x: int
    y: int
    key: str

class LakeSeed(BaseModel):
    x: int
    y: int
    size: int
    key: str

class HydrologyLayerPlan(BaseModel):
    requested: HydrologyRequested
    chosen: Dict[str, int]  # {"rivers": int, "lakes": int}
    river_sources: List[RiverSource] = Field(default_factory=list)
    lake_seeds: List[LakeSeed] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)

class BiomeAssignment(BaseModel):
    coast_biomes: List[str] = Field(default_factory=list)
    interior_weights: Dict[str, float] = Field(default_factory=dict)

class BiomesLayerPlan(BaseModel):
    pack: str
    assignment: BiomeAssignment
    smoothing: Dict[str, Any] = Field(default_factory=dict)

class SettlementPick(BaseModel):
    x: int
    y: int
    score: float
    near: Optional[List[str]] = None
    type: Optional[str] = None
    at_river_mouth: Optional[bool] = None

class SettlementsLayerPlan(BaseModel):
    candidates_scanned: int
    selected: Dict[str, List[SettlementPick]]
    constraints: Dict[str, Any] = Field(default_factory=dict)

class RoadsLayerPlan(BaseModel):
    strategy: Literal["mst"] = "mst"
    nodes: int
    edges: int
    bridges: Dict[str, Any] = Field(default_factory=dict)

class POIPick(BaseModel):
    tag: str
    x: int
    y: int
    why: Optional[List[str]] = None

class POILayerPlan(BaseModel):
    budget: int
    tables: List[str]
    min_spacing: int
    selected_preview: List[POIPick] = Field(default_factory=list)
    rejected_preview: List[POIPick] = Field(default_factory=list)

class ResourceCoverageStats(BaseModel):
    p10: float
    p50: float
    p90: float
    high_tiles_est: int

class ResourcesLayerPlan(BaseModel):
    potentials: List[str]
    thresholds: Dict[str, float]
    coverage_estimate: Dict[str, ResourceCoverageStats]
    materialization_policy: Dict[str, Any] = Field(default_factory=dict)


# ---- collision / tile flags --------------------------------------------------

class TileFlags(BaseModel):
    """Per-tile movement modifiers and hazards.
    Defaults are permissive (walkable land). Generator can sparsely annotate tiles.
    """
    walkable: bool = Field(True, description="If false, player movement is blocked")
    swim: bool = Field(False, description="If true, tile requires swim/boat to enter")
    slow: Optional[float] = Field(
        None, ge=0.0, le=1.0, description="Movement multiplier (0.5 = half speed)"
    )
    hazard: Optional[str] = Field(
        None, description="Optional hazard tag (e.g., 'lava', 'spikes')"
    )

class CollisionLayerPlan(BaseModel):
    """Sparse mapping of coordinates to TileFlags.

    Keep this sparse to avoid large payloads: only non-default tiles should appear here.
    """
    # Represent coordinates as "x,y" keys to stay JSON-friendly
    flags: Dict[str, TileFlags] = Field(
        default_factory=dict,
        description="Mapping of 'x,y' -> TileFlags for non-default tiles",
    )
    notes: List[str] = Field(default_factory=list)

class TileSchema(BaseModel):
    """Optional richer per-tile representation for clients that want biome+flags.

    Not required for current generator, but useful for serializing a grid-of-objects.
    """
    biome: str
    flags: Optional[TileFlags] = None
    site: Optional[str] = None

    collision: Optional[CollisionLayerPlan] = None

# ---- metrics, warnings, would_write -----------------------------------------

class TileCountsEstimate(BaseModel):
    land: int
    ocean: int
    coast: int
    river_tiles: int
    lake_tiles: int

class ConnectivityMetrics(BaseModel):
    road_components: int
    river_outlets: int

class MetricsBlock(BaseModel):
    tile_counts_estimate: TileCountsEstimate
    connectivity: ConnectivityMetrics

class WarningItem(BaseModel):
    code: str
    layer: str
    severity: Severity
    message: str
    suggestion: Optional[str] = None

class CompatBlock(BaseModel):
    includes_legacy_tiles: bool = True
    includes_grid_and_sites: bool = True
    extra_layers: List[str] = Field(default_factory=list)

class WouldWriteBlock(BaseModel):
    filename: str
    path: str
    compat: CompatBlock

# ---- PlanResponse ------------------------------------------------------------

class PlanResponse(BaseModel):
    ok: bool = True
    plan_id: str
    timestamp: str  # ISO8601 (UTC)

    provenance: Provenance
    grid: GridSpec
    diff: DiffBlock
    budgets: BudgetsBlock

    layers: LayersBlock
    metrics: MetricsBlock
    warnings: List[WarningItem] = Field(default_factory=list)

    would_write: WouldWriteBlock

    # config
    if PydV2:
        model_config = ConfigDict(extra="ignore")

    @_fv("timestamp")
    def _check_ts(cls, v: str):
        if not v or "T" not in v or "Z" not in v:
            # Keep permissive; generator should emit proper ISO-8601 Zulu time.
            raise ValueError("timestamp must be ISO8601 UTC (e.g., 2025-08-20T15:12:03Z)")
        return v

# =========================
# Convenience aliases
# =========================

__all__ = [
    "Severity",
    "PlanVerbosity",
    "PlanRequest",
    "PlanResponse",
    # Submodels (exported for testing/tools)
    "TemplateOverrides",
    "WaterOverrides",
    "HydrologyOverrides",
    "SettlementOverrides",
    "RoadsOverrides",
    "POIOverrides",
    "ResourcesOverrides",
    "GridSpec",
    "Provenance",
    "TileFlags",
    "CollisionLayerPlan",
    "TileSchema",
    "LayersBlock",
    "WarningItem",
]
