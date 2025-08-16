Bootstrap Helper (v7)
=====================

**Symptom fixed:** no tiles rendering even though the shard loads and no console errors.

**Cause:** `setShard()` was running before the PIXI view had a real width/height,
so the renderer's culling built zero chunks.

**Fix:** Call `resize()` BEFORE `setShard()`. Use the helper below.

Quick Integration
-----------------
```js
// main.js
import { mountEditorAndRenderer } from './static/src/dev/initEditorMount.js';
// After your shard is loaded:
const canvas = document.querySelector('#mapCanvas'); // or your canvas id
const { pixi, editor } = mountEditorAndRenderer({
  canvas,
  root: '#mapViewer',  // the container where the right-hand panel should mount
  shard,
  tileW: 16,
  tileH: 8,
  chunkSize: 64,
});
```

Notes
-----
- The helper sets the origin to (centerX, 25% height). Adjust as you like with `pixi.setOrigin(x,y)`.
- Editor still supports: click-to-lock selection, tooltip with (x,y)·biome, dashed rect selection,
  undo/redo, and reset-to-defaults.
- Renderer exposes `markTileDirty(tx,ty)` and `setTileStyleResolver(fn)`.

If your canvas uses a different selector or is sized dynamically, keep the `fit()` logic as-is.
