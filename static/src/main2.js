// /static/src/main2.js

import { renderShard } from './shards/renderShard.js';
import { initCamera, applyZoom, getZoomLevel } from './ui/camera.js';
import { getTileUnderMouse, calculateViewportSize } from './ui/viewportUtils.js';
import { togglePanel } from './ui/uiUtils.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './utils/shardLoader.js';
import { updateDevStatsPanel } from './utils/tileUtils.js';

window.addEventListener('DOMContentLoaded', async () => {
  console.log('[main2] DOM ready');

  // 1) load settings
  const settings = await fetch('/static/src/settings.json').then(r => r.json());
  console.log('[main2] settings =', settings);

  // 2) panel-toggle wiring
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    const target = btn.dataset.target;
    btn.addEventListener('click', () => {
      console.log(`[main2] togglePanel ➡ ${target}`);
      togglePanel(target);
    });
  });

  // 3) viewport sizing
  const { cols, rows } = calculateViewportSize(TILE_WIDTH, TILE_HEIGHT);
  console.log(`[main2] viewport cols=${cols}, rows=${rows}`);

  // 4) setup wrapper & canvas
  const wrapper = document.getElementById('viewportWrapper');
  wrapper.style.width = `${cols * TILE_WIDTH}px`;
  wrapper.style.height = `${rows * TILE_HEIGHT}px`;
  wrapper.style.position = 'relative';

  const canvas = document.getElementById('viewport');
  canvas.width  = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const ctx = canvas.getContext('2d');
  console.log('[main2] canvas initialized');

  // 5) compute origin for isometric math (must match renderShard)
  const originX = canvas.width / 2;
  const originY = 40; // same hard‐coded offset used in renderShard
  console.log(`[main2] originX=${originX}, originY=${originY}`);

  // 6) load & render shard
  const shard = await fetch('/static/public/shards/shard_0_0.json').then(r => r.json());
  console.log('[main2] shard loaded', shard);
  renderShard(ctx, shard);
  console.log('[main2] initial renderShard()');

  // 7) dev‐tools: save, load, regen
  document.getElementById('saveShard').onclick = () => {
    console.log('[main2] saveShard clicked');
    saveShard(shard);
  };
  document.getElementById('loadShardBtn').onclick = () => {
    console.log('[main2] loadShardBtn clicked');
    document.getElementById('loadShardInput').click();
  };
  document.getElementById('loadShardInput').onchange = e => {
    const file = e.target.files[0];
    console.log('[main2] loadShardInput changed', file);
    if (!file) return;
    loadShardFromFile(file, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
      console.log('[main2] shard reloaded');
    });
  };
  document.getElementById('regenWorld').onclick = () => {
    console.log('[main2] regenWorld clicked');
    regenerateShard(settings, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
      console.log('[main2] shard regenerated');
    });
  };

  // 8) zoom controls
  initCamera(canvas, ctx, shard, renderShard, 'zoomLevel');
  const zl = document.getElementById('zoomLevel');
  if (zl) zl.textContent = `${Math.round(getZoomLevel()*100)}%`;
  document.getElementById('zoomInBtn').onclick = () => {
    console.log('[main2] zoomInBtn clicked');
    applyZoom(ctx, canvas, shard, renderShard, 'zoomLevel');
  };
  document.getElementById('zoomOutBtn').onclick = () => {
    console.log('[main2] zoomOutBtn clicked');
    applyZoom(ctx, canvas, shard, renderShard, 'zoomLevel');
  };

  // 9) click → pick & highlight a tile
  canvas.addEventListener('click', e => {
    console.log('[main2] canvas click', e.clientX, e.clientY);
    const tile = getTileUnderMouse(e, canvas, TILE_WIDTH, TILE_HEIGHT, originX, originY, shard);
    if (!tile) {
      console.log('[main2] no tile under click');
      return;
    }
    console.log('[main2] tile selected', tile);
    updateDevStatsPanel(tile);
    renderShard(ctx, shard, tile);
    console.log('[main2] shard re-rendered with highlight');
  });

  // 10) action‐bar → chat
  const PLAYER = 'Player1';
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.onclick = () => {
      const action = btn.title;
      console.log(`[main2] actionBtn clicked: ${action}`);
      const hist = document.getElementById('chatHistory');
      const now  = new Date();
      const hh   = String(now.getHours()).padStart(2,'0');
      const mm   = String(now.getMinutes()).padStart(2,'0');
      const line = document.createElement('div');
      line.textContent = `${hh}:${mm} ${PLAYER} used ${action}`;
      hist.appendChild(line);
      hist.scrollTop = hist.scrollHeight;
    };
  });

  // 11) chat input
  const hist = document.getElementById('chatHistory');
  const input = document.getElementById('chatInput');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      console.log('[main2] chat Enter:', input.value);
      const now = new Date();
      const hh  = String(now.getHours()).padStart(2,'0');
      const mm  = String(now.getMinutes()).padStart(2,'0');
      const line = document.createElement('div');
      line.textContent = `${hh}:${mm} ${PLAYER}: ${input.value.trim()}`;
      hist.appendChild(line);
      hist.scrollTop = hist.scrollHeight;
      input.value = '';
      e.preventDefault();
    }
  });
});
