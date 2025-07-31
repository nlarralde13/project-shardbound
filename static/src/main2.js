// main2.js
// ───────────────────────────────────────────────────────────
// Entrypoint for index2.html: panels, canvas, shard,
// getTileUnderMouse, highlight, zoom, chat, action-buttons.
// ───────────────────────────────────────────────────────────

import { renderShard } from './shards/renderShard.js';
import { initCamera, applyZoom, getZoomLevel } from './ui/camera.js';
import { calculateViewportSize, getTileUnderMouse } from './ui/viewportUtils.js';
import { togglePanel } from './ui/uiUtils.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './utils/shardLoader.js';
import { updateDevStatsPanel } from './utils/tileUtils.js';
import { initChat, sendMessage } from './ui/chat.js';


window.addEventListener('DOMContentLoaded', async () => {
  console.log('[main2] DOM ready');

  // 1️⃣  Load settings
  const settings = await fetch('/static/src/settings.json').then(r => r.json());
  console.log('[main2] settings =', settings);

  // 2️⃣  Wire up panel toggles (buttons have .panel-toggle + data-target)
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    // ensure each has a <span class="toggle-icon"> inside
    if (!btn.querySelector('.toggle-icon')) {
      const icon = document.createElement('span');
      icon.className = 'toggle-icon';
      icon.textContent = '+';
      btn.appendChild(icon);
    }
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => {
      console.log(`[main2] panel-toggle click → ${targetId}`);
      togglePanel(targetId);
    });
  });

  // 3️⃣  Compute how many tiles fit
  const { cols, rows } = calculateViewportSize(TILE_WIDTH, TILE_HEIGHT);
  console.log(`[main2] viewportSize cols=${cols}, rows=${rows}`);

  // 4️⃣  Grab the wrapper & canvas
  const wrapper = document.getElementById('viewportWrapper');
  wrapper.style.width  = `${cols * TILE_WIDTH}px`;
  wrapper.style.height = `${rows * TILE_HEIGHT}px`;
  wrapper.style.position = 'relative';

  const canvas = document.getElementById('viewport');
  canvas.width  = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const ctx = canvas.getContext('2d');
  console.log('[main2] canvas initialized');

  // 5️⃣  Set iso‐origin
  const originX = canvas.width / 2;
  const originY = 40;
  console.log(`[main2] originX=${originX}, originY=${originY}`);

  // 6️⃣  Load & draw shard
  const shard = await fetch('/static/public/shards/shard_0_0.json').then(r => r.json());
  console.log('[main2] shard loaded', shard);
  renderShard(ctx, shard);
  console.log('[main2] initial renderShard()');

  // 7️⃣  Dev-tools: Save / Load / Regenerate
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
    console.log('[main2] loadShardInput changed →', file);
    if (!file) return;
    loadShardFromFile(file, newShard => {
      Object.assign(shard, newShard);
      renderShard(ctx, shard);
      console.log('[main2] shard reloaded from file');
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

  // 8️⃣  Zoom controls + overlay
  initCamera(canvas, ctx, shard, renderShard, 'zoomLevel');
  document.getElementById('zoomLevel').textContent = `${Math.round(getZoomLevel()*100)}%`;
  document.getElementById('zoomInBtn').onclick = () => {
    console.log('[main2] zoomInBtn clicked');
    applyZoom(ctx, canvas, shard, renderShard, 'zoomLevel');
  };
  document.getElementById('zoomOutBtn').onclick = () => {
    console.log('[main2] zoomOutBtn clicked');
    applyZoom(ctx, canvas, shard, renderShard, 'zoomLevel');
  };

  // 9️⃣  Click to select & highlight tile
  canvas.addEventListener('click', e => {
    console.log('[main2] canvas click event');
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const tile = getTileUnderMouse(
      clickX, clickY,
      TILE_WIDTH, TILE_HEIGHT,
      originX, originY,
      shard,
      wrapper
    );
    if (!tile) {
      console.log('[main2] no tile under click');
      return;
    }
    console.log('[main2] tile selected →', tile);
    updateDevStatsPanel(tile);
    renderShard(ctx, shard, tile);
    console.log('[main2] re-renderShard with highlight');
  });

  // 10) Initialize chat:
  initChat('#chatHistory', '#chatInput');

  // 11) Wire up your action buttons:
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Prefer data-action, then title, then the visible text
      const action = btn.dataset.action
                  || btn.title
                  || btn.textContent.trim();

      console.log(`[main2] actionBtn clicked → ${action}`);
      sendMessage(`Player1 used ${action}`);
    });
  });
});
