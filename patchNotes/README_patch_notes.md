# ProjectMMO Full Patch (Biome Editing + Rect Selection + Renderer Hook)

This package fixes your **"pixi.js" bare specifier** error and ships a full set of editor upgrades.

## Highlights
- **No bare imports**: `shardEditor.js` no longer uses `import * as PIXI from "pixi.js"`. It relies on `window.PIXI` (same as your renderer), so ES module resolution won't break.
- **Metadata fields**: tags[], landmark, encounterTable, spawnLevel, ownerFaction added to the Tile Metadata UI + schema helpers.
- **Undo/Redo**: batched history for paint + metadata; Ctrl/Cmd bindings can be added easily if you want.
- **Rectangle selection**: Shift+drag to select; apply metadata/paint to selection.
- **Reset to defaults**: uses `data/biomeRegistry.js` for per-biome defaults.
- **Dashed overlay**: drawn via `PIXI.Graphics` attached to `pixi.world` (zIndex above map).
- **Renderer patch**: `gfx/pixiRenderer.js` updated to include `setTileStyleResolver(fn)` + retains `markTileDirty(x,y)`.

## Files
- `static/src/data/biomeRegistry.js`
- `static/src/dev/editorState.js`
- `static/src/dev/shardEditor.js`  ← fixed import + new UI/logic
- `static/src/gfx/pixiRenderer.js` ← full replacement (style resolver + dirty-tile)

Drop these in place of your existing files. No other changes required.
