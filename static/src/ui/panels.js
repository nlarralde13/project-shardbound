// static/src/ui/panels.js

import { renderShard } from '../shards/renderShard.js';
import { getState, setState } from '../utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import {
  saveShard,
  loadShardFromFile,
  regenerateShard
} from '../shards/shardLoader.js';
import { generateRandomShard } from '../shards/rdmShardGen.js';

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

  // Flip the icon on the corresponding button
  const btn = document.querySelector(
    `button.panel-toggle[data-target="${targetId}"]`
  );
  if (!btn) {
    console.warn(`No toggle button for panel "${targetId}"`);
    return;
  }
  const icon = btn.querySelector('.toggle-icon');
  if (icon) icon.textContent = wasVisible ? '+' : '–';
}

/**
 * Finds every .panel-toggle button, injects a + icon,
 * and wires it to call togglePanel().
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
 * Wires Save / Load / Regenerate buttons.
 * All re-renders use renderFn(ctx, shardData, selectedTile, originX, originY, showGrid, useIsometric).
 */
export function initDevTools({
  shardData,
  settings,
  canvas,
  wrapper,
  ctx,
  renderFn,
  originX,
  originY
}) {
  // SAVE
  document.getElementById('saveShard').onclick = () =>
    saveShard(shardData);

  // LOAD
  const loadBtn = document.getElementById('loadShardBtn');
  const fileIn  = document.getElementById('loadShardInput');
  loadBtn.onclick = () => fileIn.click();
  fileIn.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const newShard = await loadShardFromFile(file);
      Object.assign(shardData, newShard);
      const sel   = getState('selectedTile');
      const grid  = getState('showGrid');
      const iso   = getState('useIsometric');
      renderFn(ctx, shardData, sel, originX, originY, grid, iso);
    } catch (err) {
      console.error('Load failed:', err);
    }
  };

  // REGENERATE
  document.getElementById('regenWorld').onclick = () => {
    console.log('[main2] 🌀 Regenerating random shard...');
    const newShard = generateRandomShard(settings);
    Object.assign(shardData, newShard);

    // clear any existing transform
    renderShard(ctx, shardData);

    };
  }

/**
 * Wires the “Toggle Grid” button.
 * On click, flips showGrid state and re-renders with current iso flag.
 */
export function initGridToggle(canvas, wrapper, shardData, ctx, originX, originY) {
  const btn = document.getElementById('toggleGridBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const grid = !getState('showGrid');
    setState('showGrid', grid);

    const iso = getState('useIsometric');
    renderShard(
      ctx,
      shardData,
      getState('selectedTile'),
      originX,
      originY,
      grid,
      iso
    );
  });
}
