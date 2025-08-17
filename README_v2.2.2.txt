
projectMMO — Editor + Core Engine Sync Patch v2.2.2 (full bundle)

What’s included
---------------
• Editor (2D Grid):
  - static/src/dev/shard-editor.html
  - static/src/dev/shard-editor.css
  - static/src/dev/editor/shardEditorApp.js
  - static/src/dev/editor/shardEditor.js
  - static/src/dev/editor/shardGridRenderer.js

• Data:
  - static/src/data/biomeRegistry.js   (exports BOTH: `export const biomeRegistry` and default)

• Core Engine:
  - static/src/main.js
  - static/src/camera.js
  - static/src/viewportState.js
  - static/src/playerState.js
  - static/src/playerProfile.js
  - static/src/config/mapConfig.js
  - static/src/renderShard.js
  - static/src/generateSlice.js
  - static/src/generateRoom.js
  - static/src/shardLoader.js
  - static/src/shards/rdmShardGen.js
  - static/src/gfx/pixiRenderer.js

Notes
-----
• Paths in the ZIP mirror your repo’s expected layout (no bundler required).
• `biomeRegistry.js` provides a named export `biomeRegistry` AND a default export to satisfy both
  older editor imports and rdmShardGen.js named import.
• shard-editor.html matches your known-good layout and boots the editor via startShardEditor().
• No PIXI import changes were made (kept existing import style).

How to apply
------------
1) Unzip at your project root, allowing files to overwrite their counterparts under static/src/…
2) Open /static/src/dev/shard-editor.html in the browser and hard-refresh.
3) Worldgen in the editor is wired to ../../shards/rdmShardGen.js by default; adjust if needed.

— End
