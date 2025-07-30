import { renderShard } from './shards/renderShard.js';
import { createTooltip, updateTooltip, hideTooltip } from './ui/tooltip.js';
import { initCamera, centerViewport }                 from './ui/camera.js';
import { TILE_WIDTH, TILE_HEIGHT }                     from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './utils/shardLoader.js';
import { updateDevStatsPanel }                         from './utils/tileUtils.js';
import { calculateViewportSize }                       from './ui/viewportUtils.js';

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

function getTileUnderMouse(mx, my, w, h, ox, oy, shard) {
  const dx = mx - ox, dy = my - oy;
  const isoX = Math.floor((dx/(w/2) + dy/(h/2))/2);
  const isoY = Math.floor((dy/(h/2) - dx/(w/2))/2);
  if (isoX >= 0 && isoX < shard.width && isoY >= 0 && isoY < shard.height)
    return { ...shard.tiles[isoY][isoX], x: isoX, y: isoY };
  return null;
}

window.addEventListener('DOMContentLoaded', async () => {

  // 1) wire up your manual panel-toggles
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const pane = document.getElementById(btn.dataset.target);
      const open = pane.style.display === 'block';
      pane.style.display = open ? 'none' : 'block';
      btn.querySelector('span').textContent = open ? '＋' : '–';
    });
  });

  // 2) devMode on/off
  const settings = await loadSettings();
  const devStats = document.getElementById('devStatsPanel');
  const devTools = document.getElementById('devToolsPanel');
  devStats.style.display = settings.devMode ? 'block' : 'none';
  devTools.style.display = settings.devMode ? 'block' : 'none';

  // 3) size & insert canvas
  const { cols, rows } = calculateViewportSize(TILE_WIDTH, TILE_HEIGHT);
  const canvas = document.getElementById('viewport');
  canvas.width  = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const ctx = canvas.getContext('2d');

  // 4) load & draw
  const shard = await loadShard();
  renderShard(ctx, shard);

  // 5) dev-tools buttons
  document.getElementById('saveShard').onclick = () => saveShard(shard);
  document.getElementById('loadShardBtn').onclick = () =>
    document.getElementById('loadShardInput').click();
  document.getElementById('loadShardInput').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    loadShardFromFile(f, newS => { Object.assign(shard, newS); renderShard(ctx, shard); });
  };
  document.getElementById('regenWorld').onclick = () =>
    regenerateShard(settings, newS => { Object.assign(shard, newS); renderShard(ctx, shard); });

  // 6) brush toggle
  let brush = false;
  document.getElementById('toggleBrush').onclick = () => {
    brush = !brush;
    document.getElementById('biomeEditorPanel').style.display = brush ? 'block' : 'none';
  };

  // 7) camera + centering
  initCamera(canvas, ctx, shard, renderShard, 'zoomOverlay');
  centerViewport(document.getElementById('viewportWrapper'), canvas);

  // 8) tooltip
  const tooltip = createTooltip();
  const ox = canvas.width/2, oy = 40;

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const tile = getTileUnderMouse(
      e.clientX - r.left,
      e.clientY - r.top,
      TILE_WIDTH, TILE_HEIGHT,
      ox, oy, shard
    );
    if (!tile) return;
    if (brush) {
      tile.biome = document.getElementById('biomeSelect').value;
    }
    selectedTile = tile;
    updateDevStatsPanel(tile);
    renderShard(ctx, shard, selectedTile);
  });
  canvas.addEventListener('mouseleave', () => hideTooltip(tooltip));

  // 9) chat
  const hist = document.getElementById('chatHistory');
  const input = document.getElementById('chatInput');
  // pre-fill 3 blank lines
  for (let i=0;i<3;i++) hist.appendChild(document.createElement('div'));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      const div = document.createElement('div');
      div.textContent = input.value.trim();
      hist.appendChild(div);
      hist.scrollTop = hist.scrollHeight;
      input.value = '';
    }
  });

});
