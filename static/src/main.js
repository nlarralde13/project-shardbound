// Orchestration: viewport states, rendering, zoom, hover/select, chat, dev.

import { renderShard } from './shards/renderShard.js';
import { setupZoomControls, getZoomLevel } from './ui/camera.js';
import { togglePanel } from './ui/panels.js';
import { TILE_WIDTH, TILE_HEIGHT } from './config/mapConfig.js';
import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';
import { initChat, sendMessage } from './ui/chat.js';


// Orchestration: viewport, rendering, zoom, hover/select, chat, dev.

// Unified map math
import {
  fitIsoTransform,
  computeIsoOrigin,
  getTileUnderMouseIso,
  updateDevStatsPanel
} from './utils/mapUtils.js';

// Viewport HUD & state machine
import { mountViewportHUD } from './ui/viewportHud.js';
import { onViewportChange, goMiniShard } from './state/viewportState.js';

const PLAYER = 'Player1';

window.addEventListener('DOMContentLoaded', async () => {
  // Inject toggle icons for .panel-toggle buttons
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) {
      const icon = document.createElement('span');
      icon.className = 'toggle-icon';
      icon.textContent = '+';
      btn.appendChild(icon);
    }
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => togglePanel(targetId));
  });

  // Elements
  const wrapper = document.getElementById('viewportWrapper') || document.getElementById('mapViewer');
  const canvas  = document.getElementById('viewport');
  const ctx     = canvas.getContext('2d');

  // Load initial shard
  const shardUrl = '/static/public/shards/shard_0_0.json';
  const shard = await fetch(shardUrl).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${shardUrl}`);
    return r.json();
  });
  console.log('[main] ✅ shard loaded:', { w: shard.width, h: shard.height });

  // Size + origin for isometric fit
  const fit = fitIsoTransform(
    wrapper.clientWidth, wrapper.clientHeight,
    shard.width, shard.height,
    TILE_WIDTH, TILE_HEIGHT
  );
  canvas.width  = Math.ceil(fit.mapW || wrapper.clientWidth);
  canvas.height = Math.ceil(fit.mapH || wrapper.clientHeight);
  const origin = computeIsoOrigin(canvas.width, canvas.height);

  // Interaction state
  let hoverTile = null;
  let selectedTile = null;

  // Idempotent "open" (no accidental close on second click)
  function openPanel(id) {
    const p = document.getElementById(id);
    if (!p) return;
    if (p.style.display !== 'block') p.style.display = 'block';
    const btn = document.querySelector(`button.panel-toggle[data-target="${id}"] .toggle-icon`);
    if (btn) btn.textContent = '–';
  }

  // Redraw
  function redraw() {
    renderShard(ctx, shard, { hoverTile, selectedTile, origin });
  }
  redraw();

  // Zoom controls (support both old/new IDs via options)
  setupZoomControls({
    canvas,
    shard,
    originX: origin.originX,
    originY: origin.originY,
    renderFn: (ctxArg, shardArg) =>
      renderShard(ctxArg, shardArg, { hoverTile, selectedTile, origin }),
    // Preferred IDs (index2.html variant A)
    overlayId: 'zoomOverlay',
    btnInId: 'zoomInBtn',
    btnOutId: 'zoomOutBtn',
    // Fallback IDs (variant B)
    fallbackOverlayId: 'zoomDisplay',
    fallbackBtnInId: 'zoomIn',
    fallbackBtnOutId: 'zoomOut'
  });
  console.log('[main] 🔍 zoom @', Math.round(getZoomLevel() * 100) + '%');

  // Dev tools (save / load / regen)
  document.getElementById('saveShard')?.addEventListener('click', () => saveShard(shard));

  document.getElementById('loadShardBtn')?.addEventListener('click', () =>
    document.getElementById('loadShardInput')?.click()
  );

  document.getElementById('loadShardInput')?.addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      console.group('[Load Shard]');
      const newShard = await loadShardFromFile(f); // ← await the Promise
      Object.assign(shard, newShard);
      console.log('state after load:', { w: shard.width, h: shard.height });
      redraw();
    } catch (err) {
      console.error('Load shard failed:', err);
    } finally {
      console.groupEnd();
      e.target.value = ''; // allow reselecting same file
    }
  });

  document.getElementById('regenWorld')?.addEventListener('click', async () => {
    console.group('[Regenerate]');
    try {
      console.log('Calling regenerateShard...');
      const newShard = await regenerateShard({}); // ← await the Promise
      Object.assign(shard, newShard);
      console.log('New shard:', { w: shard.width, h: shard.height });
      redraw();
    } catch (err) {
      console.error('Regen failed:', err);
    } finally {
      console.groupEnd();
    }
  });

  // Chat + action bar
  initChat('#chatHistory', '#chatInput');
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.onclick = () => sendMessage(`${PLAYER} used ${btn.dataset.action || btn.title}`);
  });

  // Hover → re-render only on tile change
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const t = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shard,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );
    if ((t?.x !== hoverTile?.x) || (t?.y !== hoverTile?.y)) {
      hoverTile = t;
      redraw();
    }
  });

  // Click select → info panel (first click works)
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const t = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shard,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );
    if (!t) return;
    selectedTile = t;
    window.__lastSelectedTile = t; // optional HUD hook
    updateDevStatsPanel(t);
    redraw();
    openPanel('infoPanel'); // ← no accidental toggle-close
  });

  // Viewport HUD + state reactions
  mountViewportHUD('#mapViewer'); // attaches map button + actions
  window.dispatchExploreSelected = () => {
    if (!selectedTile) return;
    goMiniShard({ parentTile: selectedTile });
  };

  onViewportChange(({ current, payload }) => {
    console.log('[viewport] state ->', current, payload);
    // Hook transitions here (load region shard, fog, etc.)
    redraw();
  });

  // Debug handles
  window.__shard__  = shard;
  window.__origin__ = origin;
});
