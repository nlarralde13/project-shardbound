# PIXI Renderer – Dirty Tile Redraw & (Optional) Style Hook

**If your `gfx/pixiRenderer.js` already exposes `markTileDirty(x,y)` and returns `{ app, world, ... }`, no changes are required.**  
The new editor calls `pixi.markTileDirty(x,y)` whenever paint/metadata changes occur and adds a dashed rectangle overlay inside `shardEditor.js` using `PIXI.Graphics` attached to `pixi.world`.

If your renderer is missing `markTileDirty`, add a minimal implementation similar to:

```js
// Inside createPixiRenderer(...) closure
function markTileDirty(tx, ty) {
  const cx = Math.floor(tx / chunkSize), cy = Math.floor(ty / chunkSize);
  const key = `${cx},${cy}`;
  const ch = chunks.get(key);
  if (ch) {
    ch.sprite?.destroy({ children:false, texture:true, baseTexture:true });
    ch.tex?.destroy(true);
    chunks.delete(key);
  }
  enqueueBuild(cx, cy, true);
  pumpBuilder();
}

// Expose in the returned API:
return {
  app, world, /* ... */, markTileDirty,
};
```

## (Optional) Metadata-Driven Tinting
If you’d like metadata (e.g., ownerFaction) to influence tint, you can add a style hook:

```js
let _tileStyleResolver = null;
function tileColor(tile) {
  if (_tileStyleResolver) {
    const res = _tileStyleResolver(tile);
    if (res && Number.isFinite(res.color)) return res.color >>> 0;
  }
  // fallback color logic...
}
return {
  // ...
  setTileStyleResolver(fn){ _tileStyleResolver = typeof fn === 'function' ? fn : null; updateCulling?.(true); },
};
```

Then, in `shardEditor.js` you could call `pixi.setTileStyleResolver(...)` if desired.
