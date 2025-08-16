# pixiRenderer.js — Integrated Changes

This renderer includes:
- `markTileDirty(x,y)` to invalidate a tile's chunk and rebuild it.
- `setTileStyleResolver(fn)` hook so the editor can tint tiles using metadata (e.g., faction).
- Conservative chunk culling & rebuilds suitable for 100–150×150 shards.

If you already have a renderer with different internals, you can cherry-pick:
1) A tile color path that calls an injected resolver before fallback colors.
2) An exported `markTileDirty(x,y)` that kills the containing chunk and rebuilds it.
3) (Optional) Keep `world.sortableChildren = true` so overlay graphics can render above the map.
