import { renderShard } from './shards/renderShard.js';
import { createTooltip, updateTooltip, hideTooltip } from './ui/tooltip.js';
import { initCamera, centerViewport }                 from './ui/camera.js';
import { TILE_WIDTH, TILE_HEIGHT }                     from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './utils/shardLoader.js';
import { updateDevStatsPanel }                         from './utils/tileUtils.js';
import { calculateViewportSize }                       from './ui/viewportUtils.js';
import { makePanelToggle }                             from './ui/uiUtils.js';

let hoveredTile = null;
let selectedTile = null;

async function loadSettings() {
  const res = await fetch('/static/src/settings.json');
  return res.json();
}

async function loadShard() {
  const res = await fetch('/static/public/shards/shard_0_0.json');
  return res.json();
}

// Compute which tile is under the mouse in isometric coords
function getTileUnderMouse(mouseX, mouseY, tileW, tileH, originX, originY, shard) {
  const dx = mouseX - originX;
  const dy = mouseY - originY;
  const isoX = Math.floor((dx / (tileW/2) + dy / (tileH/2)) / 2);
  const isoY = Math.floor((dy / (tileH/2) - dx / (tileW/2)) / 2);
  if (isoX>=0 && isoX<shard.width && isoY>=0 && isoY<shard.height) {
    return { ...shard.tiles[isoY][isoX], x:isoX, y:isoY };
  }
  return null;
}

window.addEventListener('DOMContentLoaded', async () => {
  // 1) Panel toggles
  ['satchelPanel','questPanel','infoPanel'].forEach(makePanelToggle);

  // 2) Load settings & show/hide dev panels
  const settings = await loadSettings();
  const devStats = document.getElementById('devStatsPanel');
  const devTools = document.getElementById('devToolsPanel');
  if (settings.devMode) {
    devStats.style.display = 'block';
    devTools.style.display = 'block';
  } else {
    devStats.style.display = 'none';
    devTools.style.display = 'none';
  }

  // 3) Setup canvas size & container
  const { cols, rows } = calculateViewportSize(TILE_WIDTH, TILE_HEIGHT);
  const canvas = document.getElementById('viewport');
  canvas.width  = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const ctx = canvas.getContext('2d');

  // 4) Load shard data & initial render
  const shard = await loadShard();
  renderShard(ctx, shard);

  // 5) DevTools hooks
  document.getElementById('saveShard').addEventListener('click', () => saveShard(shard));
  document.getElementById('loadShardBtn').addEventListener('click', () => 
    document.getElementById('loadShardInput').click()
  );
  document.getElementById('loadShardInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadShardFromFile(file, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
    });
  });
  document.getElementById('regenWorld').addEventListener('click', () =>
    regenerateShard(settings, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
    })
  );

  // 6) Brush toggle
  let brushMode = false;
  document.getElementById('toggleBrush').addEventListener('click', () => {
    brushMode = !brushMode;
    document.getElementById('biomeEditorPanel').style.display = brushMode ? 'block' : 'none';
  });

  // 7) Camera & zoom
  centerViewport(document.getElementById('viewportContainer'), canvas);
  initCamera(canvas, ctx, shard, renderShard, 'zoomOverlay');

  // 8) Tooltip
  const tooltip = createTooltip();
  const originX = canvas.width/2;
  const originY = 40;

  // 9) Canvas click = select/toggle brush or tile info
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const tile = getTileUnderMouse(
      e.clientX - rect.left,
      e.clientY - rect.top,
      TILE_WIDTH, TILE_HEIGHT,
      originX, originY, shard
    );
    if (!tile) return;

    if (brushMode) {
      const biome = document.getElementById('biomeSelect').value;
      tile.biome = biome;
    }
    selectedTile = tile;
    updateDevStatsPanel(tile);
    renderShard(ctx, shard, selectedTile);
  });
  canvas.addEventListener('mouseleave', () => hideTooltip(tooltip));
});
