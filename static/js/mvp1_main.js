import { loadShard } from "../src/shards/shardLoader.js";
import { initShardRenderer } from "../src/ui/renderShard.js";
import { attachTooltip } from "../src/ui/tooltip.js";
import { generateMiniShard } from "../src/slices/generateMiniShard.js";
import { openMiniShardOverlay } from "../src/ui/renderMiniShard.js";
import { loadImages } from "../src/utils/imageLoader.js";

const viewport = document.getElementById('viewportWrapper');
const shardSelect = document.getElementById('shardSelect');
const gridToggle = document.getElementById('gridToggle');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnExplore = document.getElementById('btnExplore');
const btnReload = document.getElementById('btnReloadShard');
const logEl = document.getElementById('console');

let shard = null;
let renderer = null;
let lastSelected = { x: -1, y: -1, biome: 'ocean' };
let sprites = null;

function log(msg, data) {
  const time = new Date().toLocaleTimeString();
  let line = `[${time}] ${msg}`;
  if (data !== undefined) { try { line += " " + JSON.stringify(data); } catch { line += " " + String(data); } }
  logEl.textContent += "\n" + line; logEl.scrollTop = logEl.scrollHeight;
}

async function bootShard(id) {
  shard = await loadShard(id);
  if (!sprites) {
    sprites = await loadImages({
      land: "/static/assets/2d/character.png",
      boat: "/static/assets/2d/boat.png",
    });
  }
  if (renderer) { renderer.destroy(); renderer = null; }

  // Find a decent starting tile: prefer land next to water (a beach)
  const start = findStart(shard);
  renderer = initShardRenderer({
    container: viewport,
    shardData: shard,
    overlay: { grid: gridToggle.checked },
    onTileClick: (tile) => {
      lastSelected = tile;
      // move player token to clicked tile
      renderer.setPlayer({ x: tile.x, y: tile.y });
      log(`Selected tile (${tile.x},${tile.y}) biome=${tile.biome}`);
    },
    player: { x: start.x, y: start.y, spriteLand: sprites.land, spriteWater: sprites.boat },
  });

  attachTooltip(viewport, renderer);
  log(`Shard ${id} loaded. Player at (${start.x},${start.y}).`);
}

function findStart(shard) {
  // search for first land tile adjacent to ocean
  for (let y = 0; y < shard.tiles.length; y++) {
    for (let x = 0; x < shard.tiles[0].length; x++) {
      const c = shard.tiles[y][x];
      if (c.biome !== 'ocean' && (
        (shard.tiles[y-1]?.[x]?.biome === 'ocean') ||
        (shard.tiles[y+1]?.[x]?.biome === 'ocean') ||
        (shard.tiles[y]?.[x-1]?.biome === 'ocean') ||
        (shard.tiles[y]?.[x+1]?.biome === 'ocean')
      )) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

// UI wire-up
gridToggle.addEventListener('change', () => { if (!renderer) return; renderer.setOverlayFlags({ grid: gridToggle.checked }); log(`Grid ${gridToggle.checked ? 'on' : 'off'}.`); });
shardSelect.addEventListener('change', async () => { await bootShard(shardSelect.value); });
btnZoomIn.addEventListener('click', () => { if (!renderer) return; renderer.camera.zoomIn(); renderer.updateShard(shard); log('Zoom in'); });
btnZoomOut.addEventListener('click', () => { if (!renderer) return; renderer.camera.zoomOut(); renderer.updateShard(shard); log('Zoom out'); });
btnReload.addEventListener('click', async () => { await bootShard(shardSelect.value); log('Shard reloaded.'); });

btnExplore.addEventListener('click', () => {
  if (!renderer) { log('Renderer not ready'); return; }
  const pos = renderer.getPlayer();
  const biome = shard.tiles[pos.y][pos.x]?.biome ?? 'ocean';
  const mini = generateMiniShard({
    shardId: shard.shardId, tileX: pos.x, tileY: pos.y, biome, worldSeed: shard.worldSeed
  });
  log('Generated mini-shard 4×4 at player:', { biome: mini.biome, seed: mini.seedUsed });
  openMiniShardOverlay({
    parent: document.body,
    shardId: shard.shardId,
    tileX: pos.x,
    tileY: pos.y,
    biome,
    worldSeed: shard.worldSeed,
    mini
  });
});

// Initial boot
bootShard(shardSelect.value || 'A');
