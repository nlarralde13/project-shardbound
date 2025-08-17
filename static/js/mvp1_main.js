// MVP1 sandbox wiring (module)
import { loadShard } from "/static/src/shards/shardLoader.js";
import { initShardRenderer } from "/static/src/ui/renderShard.js";
import { attachTooltip } from "/static/src/ui/tooltip.js";
import { generateMiniShard } from "/static/src/slices/generateMiniShard.js";

// Elements
const viewport = document.getElementById('viewportWrapper');
const shardSelect = document.getElementById('shardSelect');
const gridToggle = document.getElementById('gridToggle');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnExplore = document.getElementById('btnExplore');
const btnReload = document.getElementById('btnReloadShard');
const logEl = document.getElementById('console');

// State
let shard = null;
let renderer = null;
let lastSelected = { x: -1, y: -1, biome: 'ocean' };

// Logger
function log(msg, data) {
  const time = new Date().toLocaleTimeString();
  let line = `[${time}] ${msg}`;
  if (data !== undefined) {
    try {
      line += " " + JSON.stringify(data);
    } catch {
      line += " " + String(data);
    }
  }
  logEl.textContent += "\n" + line;
  logEl.scrollTop = logEl.scrollHeight;
}

// Boot / reload shard
async function bootShard(id) {
  shard = await loadShard(id);
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
  renderer = initShardRenderer({
    container: viewport,
    shardData: shard,
    overlay: { grid: gridToggle.checked },
    onTileClick: (tile) => {
      lastSelected = tile;
      log(`Selected tile (${tile.x},${tile.y}) biome=${tile.biome}`);
    }
  });
  attachTooltip(viewport, renderer);
  log(`Shard ${id} loaded.`);
}

// UI wire-up
gridToggle.addEventListener('change', () => {
  if (!renderer) return;
  renderer.setOverlayFlags({ grid: gridToggle.checked });
  log(`Grid ${gridToggle.checked ? 'on' : 'off'}.`);
});

shardSelect.addEventListener('change', async () => {
  await bootShard(shardSelect.value);
});

btnZoomIn.addEventListener('click', () => {
  if (!renderer) return;
  renderer.camera.zoomIn();
  renderer.updateShard(shard); // force redraw
  log('Zoom in');
});

btnZoomOut.addEventListener('click', () => {
  if (!renderer) return;
  renderer.camera.zoomOut();
  renderer.updateShard(shard);
  log('Zoom out');
});

btnReload.addEventListener('click', async () => {
  await bootShard(shardSelect.value);
  log('Shard reloaded.');
});

btnExplore.addEventListener('click', () => {
  if (!renderer || lastSelected.x < 0) {
    log('No tile selected. Click a tile first.');
    return;
  }
  const mini = generateMiniShard({
    shardId: shard.shardId,
    tileX: lastSelected.x,
    tileY: lastSelected.y,
    biome: lastSelected.biome,
    worldSeed: shard.worldSeed
  });
  log('Generated mini-shard 4×4:', { biome: mini.biome, seed: mini.seedUsed });
  // Pretty print a 4×4 summary of mobs/resources per room:
  const summary = mini.rooms.map(row =>
    row.map(room => {
      const m = room.mobs.map(x => x.id).join('|') || '-';
      const r = room.resources.map(x => x.id).join('|') || '-';
      return `[M:${m} R:${r}]`;
    }).join(' ')
  ).join('\n');
  log(summary);
});

// Initial boot
bootShard(shardSelect.value || 'A');
