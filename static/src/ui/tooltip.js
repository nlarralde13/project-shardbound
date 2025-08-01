// tooltip.js
// Handles isometric hit-testing and click interactions for the shard view

import { getZoomLevel } from './camera.js';
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { renderShard } from '../shards/renderShard.js';
import { initPanelToggles } from './panels.js';
import { getState, setState } from '../utils/state.js';

/**
 * getTileUnderMouse
 * Converts a mouse click (with zoom and scroll) into the corresponding tile in an isometric grid.
 * @param {number} mouseX      - X coordinate relative to canvas origin (including scroll)
 * @param {number} mouseY      - Y coordinate relative to canvas origin (including scroll)
 * @param {number} tileW       - Width of each diamond tile in px
 * @param {number} tileH       - Height of each diamond tile in px
 * @param {number} originX     - Horizontal center offset of the grid
 * @param {number} originY     - Vertical center offset of the grid
 * @param {Object} shardData   - { width, height, tiles[y][x] }
 * @param {HTMLElement} wrapper - Scroll container for the canvas
 * @returns {Object|null}      - The tile object plus x/y indices, or null if outside bounds
 */
export function getTileUnderMouse(
  mouseX,
  mouseY,
  tileW,
  tileH,
  originX,
  originY,
  shardData,
  wrapper
) {
  // Account for wrapper scrolling
  const scrollX = wrapper.scrollLeft;
  const scrollY = wrapper.scrollTop;

  // Adjust for grid origin and scroll
  const adjustedX = (mouseX + scrollX - originX);
  const adjustedY = (mouseY + scrollY - originY);
  
  // Inverse isometric projection calculations
  const dx = adjustedX / (tileW / 2);
  const dy = adjustedY / (tileH / 2);

  // Derive tile coordinates
  const tileX = Math.floor((dx + dy) / 2);
  const tileY = Math.floor((dy - dx) / 2);

  // Bounds check
  if (
    tileX < 0 || tileY < 0 ||
    tileX >= shardData.width ||
    tileY >= shardData.height
  ) {
    return null;
  }

  // Return the tile data along with its indices
  const tile = shardData.tiles[tileY][tileX];
  console.log(
  'hit-test:',
  { mouseX, mouseY, scrollX, scrollY, adjustedX, adjustedY, dx, dy, tileX, tileY }
    );
  return { ...tile, x: tileX, y: tileY };
}

/**
 * initTileClick
 * Attaches a click listener to the canvas to:
 * 1) Compute mouse→tile coords
 * 2) Update stats panel
 * 3) Highlight selected tile
 * 4) Toggle the info panel
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} wrapper
 * @param {Object} shardData
 * @param {number} originX
 * @param {number} originY
 * @param {CanvasRenderingContext2D} ctx
 */
export function initTileClick({ canvas, wrapper, shardData, originX, originY, ctx }) {
  canvas.addEventListener('click', e => {
    // 1) Get on-screen click coords relative to canvas
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // 2) Account for CSS zoom
    const scale = getZoomLevel();
    const unX   = rawX / scale;
    const unY   = rawY / scale;

    // 3) Compute tile under mouse
    const tile = getTileUnderMouse(
      unX, unY,
      TILE_WIDTH, TILE_HEIGHT,
      originX, originY,
      shardData, wrapper
    );
    if (!tile) return;

    // 4) Update shared state and stats panel
    setState('selectedTile', tile);
    const statsEl = document.getElementById('statsContent');
    if (statsEl) statsEl.textContent = JSON.stringify(tile, null, 2);

    // 5) Re-render shard with highlight + grid overlay
    const showGrid     = getState('showGrid');
    const selectedTile = getState('selectedTile');
    const { x, y } = tile;
    console.log(`CLICKED tileX=${x}, tileY=${y}`);
    renderShard(ctx, shardData, selectedTile, originX, originY, showGrid);

    // 6) Show the info panel
    initPanelToggles('infoPanel');
  });
}
