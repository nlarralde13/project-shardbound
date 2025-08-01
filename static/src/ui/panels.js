// panels.js
import { renderShard } from '../shards/renderShard.js';      // adjust path if needed
import { getState, setState } from '../utils/state.js';     // or wherever you keep your showGrid/selectedTile
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { saveShard,
    loadShardFromFile,
    regenerateShard } from '../shards/shardLoader.js'

/**
 * Wires the “Toggle Grid” button to flip the showGrid flag
 * and re-render using the shared state.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLCanvasElement} wrapper
 * @param {object} shardData
 * @param {CanvasRenderingContext2D} ctx
 */

export function togglePanel(targetId) {
  console.log(`[uiUtils] togglePanel called for "${targetId}"`);
  const panel = document.getElementById(targetId);
  if (!panel) {
    console.warn(`[uiUtils] No panel found with id="${targetId}"`);
    return;
  }

  const wasVisible = panel.style.display === 'block';
  panel.style.display = wasVisible ? 'none' : 'block';
  console.log(`[uiUtils] Panel "${targetId}" wasVisible=${wasVisible}, now display="${panel.style.display}"`);

  // flip the toggle symbol on its button (if present)
  const btn = document.querySelector(`button.panel-toggle[data-target="${targetId}"]`);
  if (!btn) {
    console.warn(`[uiUtils] No toggle button found for panel "${targetId}"`);
    return;
  }

  const symbol = btn.querySelector('span');
  if (symbol) {
    symbol.textContent = wasVisible ? '＋' : '–';
    console.log(`[uiUtils] Button symbol flipped to "${symbol.textContent}"`);
  } else {
    console.warn(`[uiUtils] Button for "${targetId}" has no <span> to update symbol`);
  }
}

export function initPanelToggles() {
  document.querySelectorAll('.panel-toggle').forEach(btn => {
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
}


export function initDevTools({
  shardData,
  onShardUpdated,
  settings,
  canvas,
  wrapper,
  ctx,
  renderFn,
  originX,
  originY
}) {
  // Save
  document.getElementById('saveShard').onclick = () => {
    saveShard(shardData);
  };

  // Load
  const loadBtn  = document.getElementById('loadShardBtn');
  const fileIn   = document.getElementById('loadShardInput');
  loadBtn.onclick = () => fileIn.click();
  fileIn.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const newShard = await loadShardFromFile(file);
      Object.assign(shardData, newShard);
      onShardUpdated(newShard);
      renderFn(ctx, shardData, getState('selectedTile'), originX, originY, getState('showGrid'));
    } catch (err) {
      console.error('Failed to load shard from file', err);
    }
  };

  // Regenerate
  document.getElementById('regenWorld').onclick = async () => {
    try {
      const newShard = await regenerateShard(settings);
      Object.assign(shardData, newShard);
      onShardUpdated(newShard);
      renderFn(ctx, shardData, getState('selectedTile'), originX, originY, getState('showGrid'));
    } catch (err) {
      console.error('Shard regen failed', err);
    }
  };
}


export function initGridToggle(canvas, wrapper, shardData, ctx) {
  const btn = document.getElementById('toggleGridBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // flip our global showGrid state
    const newVal = !getState('showGrid');
    setState('showGrid', newVal);

    // compute same origins your main2 did
    const originX = (shardData.width  * TILE_WIDTH) / 2;
    const originY = TILE_HEIGHT / 2;

    // re-draw with the new flag
    renderShard(
      ctx,
      shardData,
      getState('selectedTile'),
      originX,
      originY,
      newVal
    );
  });
}