// static/src/ui/panels.js

import { renderShard }            from '../shards/renderShard.js';
import { getState, setState }     from '../utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import {
  saveShard,
  loadShardFromFile,
  regenerateShard   // ← now comes from shardLoader
} from '../shards/shardLoader.js';
import { playerState }            from '../players/playerState.js';

/**
 * Shows or hides a panel and flips its toggle-icon.
 */
export function togglePanel(targetId) {
  const panel = document.getElementById(targetId);
  if (!panel) {
    console.warn(`No panel with id="${targetId}"`);
    return;
  }
  const wasVisible = panel.style.display === 'block';
  panel.style.display = wasVisible ? 'none' : 'block';

  const btn = document.querySelector(
    `button.panel-toggle[data-target="${targetId}"]`
  );
  if (btn) {
    const icon = btn.querySelector('.toggle-icon');
    if (icon) icon.textContent = wasVisible ? '+' : '–';
  }
}

/**
 * Injects a + icon into each .panel-toggle button and wires toggling.
 */
export function initPanelToggles() {
  document.querySelectorAll('button.panel-toggle').forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) {
      const ic = document.createElement('span');
      ic.className   = 'toggle-icon';
      ic.textContent = '+';
      btn.appendChild(ic);
    }
    const target = btn.dataset.target;
    btn.addEventListener('click', () => togglePanel(target));
  });
}

/**
 * Wires Save / Load / Regenerate shard buttons, plus "Select World".
 * Expects a renderFn that matches renderShard(ctx, shardData, selectedTile, originX, originY, showGrid, useIso).
 */
export function initDevTools({
  shardData,
  settings,
  wrapper,    // scroll container
  ctx,
  redraw,
  originX,
  originY
}) {
  // full redraw helper
  function fullRedraw() {
    // reset any stray transforms
    ctx.resetTransform?.() || ctx.setTransform(1, 0, 0, 1, 0, 0);

    const sel  = getState('selectedTile');
    const grid = getState('showGrid');
    const iso  = getState('useIsometric');

    redraw();
    playerState.draw(ctx, originX, originY);
  }

  // ——— SAVE ———
  document.getElementById('saveShard').onclick = () => {
    saveShard(shardData);
  };

  // ——— LOAD ———
  const loadBtn = document.getElementById('loadShardBtn');
  const fileIn  = document.getElementById('loadShardInput');
  loadBtn.onclick = () => fileIn.click();
  fileIn.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const newShard = await loadShardFromFile(file);
      Object.assign(shardData, newShard);
      wrapper.scrollLeft = wrapper.scrollTop = 0;
      requestAnimationFrame(fullRedraw);
    } catch (err) {
      console.error('[panels] Load failed:', err);
    }
    // reset input so same file can be re-selected
    e.target.value = '';
  };

  // ——— REGENERATE ———
  document.getElementById('regenWorld').onclick = async () => {
    console.log('[panels] 🌀 Regenerating shard via API...');
    try {
      const newShard = await regenerateShard(settings);
      Object.assign(shardData, newShard);
      wrapper.scrollLeft = wrapper.scrollTop = 0;
      requestAnimationFrame(fullRedraw);
    } catch (err) {
      console.error('[panels] Regenerate failed:', err);
    }
  };

  // ——— SELECT WORLD DROPDOWN ———
  const worldSelect = document.getElementById('worldSelect');
  if (worldSelect) {
    worldSelect.onchange = async e => {
      const filename = e.target.value;
      if (!filename) return;
      try {
        const res = await fetch(`/static/public/shards/${filename}`);
        if (!res.ok) throw new Error(`Failed to load ${filename}`);
        const selected = await res.json();
        Object.assign(shardData, selected);
        wrapper.scrollLeft = wrapper.scrollTop = 0;
        requestAnimationFrame(fullRedraw);
      } catch (err) {
        console.error('[panels] Select World failed:', err);
      }
    };
  }
}

/**
 * Wires the “Toggle Grid” button.
 */
export function initGridToggle({
    shardData,
    settings,
    wrapper,
    ctx,
    redraw,
    originX,
    originY
}) {
  const btn = document.getElementById('toggleGridBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    setState('showGrid', !getState('showGrid'));
    requestAnimationFrame(() => {
      const sel  = getState('selectedTile');
      const grid = getState('showGrid');
      const iso  = getState('useIsometric');
      renderShard(ctx, shardData, sel, originX, originY, grid, iso);
      playerState.draw(ctx, originX, originY);
    });
  });
}
