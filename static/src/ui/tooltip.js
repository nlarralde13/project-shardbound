// static/src/ui/tooltip.js
// Thin wrapper that wires hover/click using the unified mapUtils.
// Duplicated math has been removed.

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { getTileUnderMouseIso, updateDevStatsPanel } from '../utils/mapUtils.js';

/**
 * Initialize hover + click handlers for the map.
 * Everything uses mapUtils.getTileUnderMouseIso().
 *
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {{width:number,height:number,tiles:any[][]}} opts.shardData
 * @param {number} opts.originX
 * @param {number} opts.originY
 * @param {CanvasRenderingContext2D} [opts.ctx]         // optional, for redraw calls
 * @param {Function} [opts.redraw]                      // optional, to re-render outlines
 * @param {Function} [opts.onHover]                     // optional, (tile|null) => void
 * @param {Function} [opts.onClick]                     // optional, (tile) => void
 */
export function initTileClick({
  canvas,
  shardData,
  originX,
  originY,
  ctx,
  redraw,
  onHover,
  onClick
}) {
  const origin = { originX, originY };
  let lastHover = null;

  // Hover highlight
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const tile = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shardData,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );

    if (tile?.x !== lastHover?.x || tile?.y !== lastHover?.y) {
      lastHover = tile || null;
      onHover?.(lastHover);
      redraw?.();
    }
  });

  // Click select
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const tile = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shardData,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );
    if (!tile) return;

    // Update dev/info panels if you’re in dev mode
    updateDevStatsPanel(tile);
    onClick?.(tile);
    redraw?.();
  });
}
