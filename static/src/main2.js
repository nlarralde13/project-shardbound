import { renderShard } from './shards/renderShard.js';
import { createTooltip, updateTooltip, hideTooltip } from './ui/tooltip.js';
import { initCamera, centerViewport } from './ui/camera.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import {
  saveShard,
  loadShardFromFile,
  regenerateShard
} from './utils/shardLoader.js';
import { updateDevStatsPanel } from './utils/tileUtils.js';
import { calculateViewportSize } from './ui/viewportUtils.js';

// ——— Helpers —————————————————————————————————————

async function loadSettings() {
  const res = await fetch('/static/src/settings.json');
  return res.json();
}

async function loadShard() {
  const res = await fetch('/static/public/shards/shard_0_0.json');
  return res.json();
}

function getTileUnderMouse(mx, my, tileW, tileH, ox, oy, shard) {
  const dx = mx - ox;
  const dy = my - oy;
  const isoX = Math.floor((dx / (tileW / 2) + dy / (tileH / 2)) / 2);
  const isoY = Math.floor((dy / (tileH / 2) - dx / (tileW / 2)) / 2);
  if (
    isoX >= 0 &&
    isoX < shard.width &&
    isoY >= 0 &&
    isoY < shard.height
  ) {
    return { ...shard.tiles[isoY][isoX], x: isoX, y: isoY };
  }
  return null;
}

// ——— Main Initialization —————————————————————————

window.addEventListener('DOMContentLoaded', async () => {
  // 1) Panel-toggle buttons
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const pane = document.getElementById(btn.dataset.target);
      if (!pane) return;
      const isOpen = pane.style.display === 'block';
      pane.style.display = isOpen ? 'none' : 'block';
      btn.querySelector('span').textContent = isOpen ? '＋' : '–';
    });
  });

  // 2) Load settings & show/hide Dev panels
  const settings = await loadSettings();
  const devStats = document.getElementById('devStatsPanel');
  const devTools = document.getElementById('devToolsPanel');
  if (settings.devMode) {
    if (devStats) devStats.style.display = 'block';
    if (devTools) devTools.style.display = 'block';
  } else {
    if (devStats) devStats.style.display = 'none';
    if (devTools) devTools.style.display = 'none';
  }

  // 3) Ensure hidden file-input #loadShardInput
  let loadInput = document.getElementById('loadShardInput');
  if (!loadInput && devTools) {
    loadInput = document.createElement('input');
    loadInput.type = 'file';
    loadInput.id = 'loadShardInput';
    loadInput.accept = '.json';
    loadInput.style.display = 'none';
    devTools.appendChild(loadInput);
  }

  // 4) Set up canvas size & context
  const { cols, rows } = calculateViewportSize(
    TILE_WIDTH,
    TILE_HEIGHT
  );
  const canvas = document.getElementById('viewport');
  canvas.width = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const ctx = canvas.getContext('2d');

  // 5) Load & render initial shard
  const shard = await loadShard();
  renderShard(ctx, shard);

  // 6) Dev-tools buttons
  document.getElementById('saveShard').onclick = () =>
    saveShard(shard);

  document.getElementById('loadShardBtn').onclick = () =>
    loadInput?.click();

  if (loadInput) {
    loadInput.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      loadShardFromFile(file, newShard => {
        Object.assign(shard, newShard);
        renderShard(ctx, shard);
      });
    };
  }

  document.getElementById('regenWorld').onclick = () =>
    regenerateShard(settings, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
    });

  // 7) Brush toggle
  let brushMode = false;
  document.getElementById('toggleBrush').addEventListener('click', () => {
    brushMode = !brushMode;
    document.getElementById('biomeEditorPanel').style.display = brushMode
      ? 'block'
      : 'none';
  });

  // 8) Camera & centering
  initCamera(canvas, ctx, shard, renderShard, 'zoomOverlay');
  centerViewport(
    document.getElementById('viewportWrapper'),
    canvas
  );

  // 9) Tooltip on hover
  const tooltip = createTooltip();
  const originX = canvas.width / 2;
  const originY = 40;
  canvas.addEventListener('mousemove', e => {
    const b = canvas.getBoundingClientRect();
    const tile = getTileUnderMouse(
      e.clientX - b.left,
      e.clientY - b.top,
      TILE_WIDTH,
      TILE_HEIGHT,
      originX,
      originY,
      shard
    );
    if (tile) {
      updateTooltip(
        tooltip,
        tile,
        e.pageX,
        e.pageY,
        settings.devMode
      );
    } else {
      hideTooltip(tooltip);
    }
  });

  // 10) Click to select/paint tile
  let selectedTile = null;
  canvas.addEventListener('click', e => {
    const b = canvas.getBoundingClientRect();
    const tile = getTileUnderMouse(
      e.clientX - b.left,
      e.clientY - b.top,
      TILE_WIDTH,
      TILE_HEIGHT,
      originX,
      originY,
      shard
    );
    if (!tile) return;
    if (brushMode) {
      const biome = document.getElementById('biomeSelect').value;
      tile.biome = biome;
      renderShard(ctx, shard, tile);
    }
    selectedTile = tile;
    updateDevStatsPanel(tile);
    renderShard(ctx, shard, selectedTile);
  });
  canvas.addEventListener('mouseleave', () =>
    hideTooltip(tooltip)
  );

  // 11) Chat with timestamp
  const hist = document.getElementById('chatHistory');
  const input = document.getElementById('chatInput');

  // pre-fill 3 blank lines
  for (let i = 0; i < 3; i++) {
    hist.appendChild(document.createElement('div'));
  }

  function nowHHMM() {
    const d = new Date();
    return (
      String(d.getHours()).padStart(2, '0') +
      ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  }

  const PLAYER_NAME = 'Player1';
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      const line = document.createElement('div');
      line.textContent = `${nowHHMM()} ${PLAYER_NAME}: ${input.value.trim()}`;
      hist.appendChild(line);
      hist.scrollTop = hist.scrollHeight;
      input.value = '';
      e.preventDefault();
    }
  });
});
