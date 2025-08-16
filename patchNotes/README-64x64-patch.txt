README — 64×64 Default Patch
Built: 2025-08-16T11:26:52.435617Z

WHAT'S IN HERE
--------------
1) /static/src/config/mapConfig.js
   - Full regenerated config with SHARD_WIDTH/SHARD_HEIGHT set to 64.
   - Adds MAX_SHARD_WIDTH/HEIGHT for UI validation and future chunking.

2) /static/src/rdmShardGen.js
   - Generator wired to read defaults from mapConfig (64×64).
   - Exposes SHARD_PRESETS and keeps deterministic per-tile seeds.

3) /static/src/data/worlds/core_world/manifest.example.json
   - Example manifest with chunk.size=64 and 64×64 shard entries + neighbors.

HOW TO INTEGRATE
----------------
- Replace your existing /static/src/config/mapConfig.js with this file.
- Replace /static/src/rdmShardGen.js with this file.
- Keep your biomeRegistry and rng as-is.
- Optional: copy manifest.example.json next to your real manifest and merge fields as needed.

EDITOR SUGGESTION
-----------------
- In shard-editor.html, set World → Width/Height defaults to 64 so regenerate matches config:
    <input id="regenW" value="64" ...>
    <input id="regenH" value="64" ...>

TWEAK POINTS
------------
- If you later increase shard size globally, update SHARD_WIDTH/HEIGHT here only.
- Use MAX_* to clamp any UI that allows custom sizes.
- For larger worlds, tile multiple 64×64 shards and use 'neighbors' in the manifest.
