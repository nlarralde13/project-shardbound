# /app/shardEngine/persistence.py
from __future__ import annotations

import json, time, tempfile, os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------- Errors & result ----------

class SaveError(RuntimeError):
    ...

@dataclass
class SaveResult:
    path: Path
    name: str           # filename
    url_path: str       # /static/public/shards/<filename>

# ---------- Paths ----------

def default_shards_dir() -> Path:
    """
    Resolve /static/public/shards relative to /app (do not import app.py).
    """
    root = Path(__file__).resolve().parents[1]   # /app
    d = root / "static" / "public" / "shards"
    d.mkdir(parents=True, exist_ok=True)
    return d

# ---------- Helpers ----------

def _safe_name(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in ("_", "-"))

def _format_filename(seed: int, base_name: str) -> str:
    return f"{int(seed):08d}_{_safe_name(base_name)}.json"

def _grid_to_legacy_tiles(grid: List[List[str]]) -> List[List[Dict[str, str]]]:
    # legacy shape v1 viewers expect: tiles[y][x] = {"tile": "<id>"}
    return [[{"tile": cell} for cell in row] for row in grid]

def _sites_to_legacy_pois(sites: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # legacy POIs are shallow dicts; keep v2 fields where possible
    out = []
    for s in sites:
        pos = s.get("pos") or s.get("position") or [s.get("x"), s.get("y")]
        x, y = (int(pos[0]), int(pos[1])) if isinstance(pos, (list, tuple)) else (int(s.get("x", 0)), int(s.get("y", 0)))
        out.append({
            "type": s.get("type", "POI"),
            "name": s.get("name", s.get("tag", "POI")),
            "x": x, "y": y,
            "meta": s.get("meta", {})
        })
    return out

def _validate_rect(name: str, grid: List[List[str]], w: int, h: int) -> None:
    if len(grid) != h:
        raise SaveError(f"{name}: grid height mismatch (got {len(grid)} vs {h})")
    for row in grid:
        if len(row) != w:
            raise SaveError(f"{name}: grid width mismatch (got {len(row)} vs {w})")

def _atomic_write(path: Path, text: str, retries: int = 5, delay: float = 0.05) -> None:
    """
    Write text to a temp file and atomically replace the target.
    Windows needs the mkstemp fd closed before we re-open/replace.
    Includes a small retry loop for transient AV/indexer locks.
    """
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp_", suffix=".json")
    tmp = Path(tmp_name)
    try:
        # IMPORTANT on Windows: close the low-level fd before re-opening/writing
        os.close(fd)

        # Write the content
        tmp.write_text(text, encoding="utf-8")

        # Atomic replace with a few retries for transient locks
        for attempt in range(retries):
            try:
                os.replace(str(tmp), str(path))  # atomic on Win & POSIX
                break
            except PermissionError:
                if attempt == retries - 1:
                    raise
                time.sleep(delay * (2 ** attempt))
    finally:
        # Best-effort cleanup if something went wrong
        try:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
        except Exception:
            pass

# ---------- Public API ----------

def assemble_payload_v2(
    *,
    name: str,
    display_name: str,
    seed: int,
    width: int,
    height: int,
    grid: List[List[str]],
    sites: List[Dict[str, Any]],
    layers: Dict[str, Any],
    provenance: Dict[str, Any],
    meta_extra: Optional[Dict[str, Any]] = None,
    legacy_tiles: Optional[List[List[Dict[str, str]]]] = None,
    legacy_pois: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Build a v2 shard JSON that remains backward compatible with v1 viewers.
    """
    _validate_rect("assemble_payload_v2", grid, width, height)

    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    meta = {
        "name": name,
        "displayName": display_name,
        "seed": int(seed),
        "width": int(width),
        "height": int(height),
        "createdAt": created_at,
        "version": "2.0.0",
    }
    if meta_extra:
        meta.update(meta_extra)

    payload = {
        "meta": meta,
        # Legacy shapes (existing UI/loader paths use these today)
        "tiles": legacy_tiles if legacy_tiles is not None else _grid_to_legacy_tiles(grid),
        "pois": legacy_pois if legacy_pois is not None else _sites_to_legacy_pois(sites),
        # Canonical/v2
        "grid": grid,
        "sites": sites,
        "layers": layers,
        "provenance": provenance,  # { generator:"v2", template:"id@ver", biome_pack:"id@ver", seed, ... }
    }
    return payload

def save_shard_v2(
    *,
    base_name: str,
    seed: int,
    grid: List[List[str]],
    sites: List[Dict[str, Any]],
    layers: Dict[str, Any],
    width: int,
    height: int,
    display_name: Optional[str] = None,
    provenance: Optional[Dict[str, Any]] = None,
    shards_dir: Optional[Path] = None,
    meta_extra: Optional[Dict[str, Any]] = None,
    legacy_tiles: Optional[List[List[Dict[str, str]]]] = None,
    legacy_pois: Optional[List[Dict[str, Any]]] = None,
) -> SaveResult:
    """
    Save a v2 shard JSON using the v1 filename convention "<seedId>_<name>.json".
    Returns SaveResult(path, name, url_path).
    """
    shards_dir = shards_dir or default_shards_dir()
    fname = _format_filename(seed, base_name)
    path = shards_dir / fname

    payload = assemble_payload_v2(
        name=fname[:-5],  # without .json, matches v1 meta.name style
        display_name=(display_name or _safe_name(base_name).replace("_", " ").title()),
        seed=seed,
        width=width,
        height=height,
        grid=grid,
        sites=sites,
        layers=layers or {},
        provenance=provenance or {},
        meta_extra=meta_extra,
        legacy_tiles=legacy_tiles,
        legacy_pois=legacy_pois,
    )

    # final validation parity with v1 save (tiles/pois present etc.)
    if "meta" not in payload or "grid" not in payload or "sites" not in payload:
        raise SaveError("payload missing required sections (meta/grid/sites)")

    text = json.dumps(payload, indent=2)
    _atomic_write(path, text)

    return SaveResult(path=path, name=path.name, url_path=f"/static/public/shards/{path.name}")
