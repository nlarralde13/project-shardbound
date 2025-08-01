// static/src/ui/tooltip.js

import { getZoomLevel } from './camera.js';
import { renderShard }  from '../shards/renderShard.js';
import { togglePanel }  from './panels.js';
import { TILE_WIDTH, TILE_HEIGHT, ORTHO_TILE_SIZE } from '../config/mapConfig.js';
import { getState, setState } from '../utils/state.js';

/**
 * Draws a golden highlight around the given tile.
 */
function drawHighlight(ctx, tile, originX, originY, useIsometric) {
  const { x, y } = tile;
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth   = 2;

  if (useIsometric) {
    const sx = originX + (x - y) * (TILE_WIDTH / 2);
    const sy = originY + (x + y) * (TILE_HEIGHT / 2);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH/2, sy + TILE_HEIGHT/2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH/2, sy + TILE_HEIGHT/2);
    ctx.closePath();
    ctx.stroke();
  } else {
    const sx = x * ORTHO_TILE_SIZE;
    const sy = y * ORTHO_TILE_SIZE;
    ctx.strokeRect(sx, sy, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE);
  }
}

/**
 * Converts a mouse position to a tile index, for iso or ortho.
 */
export function getTileUnderMouse(
  mouseX,
  mouseY,
  originX,
  originY,
  shardData,
  wrapper,
  useIsometric = true
) {
  const scrollX = wrapper.scrollLeft;
  const scrollY = wrapper.scrollTop;

  if (!useIsometric) {
    const tx = Math.floor((mouseX + scrollX) / ORTHO_TILE_SIZE);
    const ty = Math.floor((mouseY + scrollY) / ORTHO_TILE_SIZE);
    console.log('[getTileUnderMouse][ortho]', { mouseX, mouseY, tx, ty });
    if (tx < 0 || ty < 0 || tx >= shardData.width || ty >= shardData.height) return null;
    return { ...shardData.tiles[ty][tx], x: tx, y: ty };
  }

  const ax = mouseX + scrollX - originX;
  const ay = mouseY + scrollY - originY;
  const dx = ax / (TILE_WIDTH / 2);
  const dy = ay / (TILE_HEIGHT / 2);
  const tx = Math.floor((dx + dy) / 2);
  const ty = Math.floor((dy - dx) / 2);
  console.log('[getTileUnderMouse][iso]', { mouseX, mouseY, tx, ty });
  if (tx < 0 || ty < 0 || tx >= shardData.width || ty >= shardData.height) return null;
  return { ...shardData.tiles[ty][tx], x: tx, y: ty };
}

/**
 * Attaches a click listener to the canvas that:
 * 1) Picks the tile
 * 2) Updates the stats panel
 * 3) Redraws via renderFn (with selected tile)
 * 4) Draws the golden highlight
 * 5) Opens the info panel on a single click
 */
export function initTileClick({ canvas, wrapper, shardData, originX, originY, ctx, renderFn }) {
    const wrapper = document.getElementById('viewportWrapper');
    const scrollLeft = wrapper.scrollLeft;
    const scrollTop = wrapper.scrollTop;

    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left + scrollLeft;
    const rawY = e.clientY - rect.top + scrollTop;
    wrapper.addEventListener('click', e => {
        const rect  = canvas.getBoundingClientRect();
        const rawX  = e.clientX - rect.left;
        const rawY  = e.clientY - rect.top;
        const scale = getZoomLevel();
        const mx    = rawX / scale;
        const my    = rawY / scale;

        const useIso = getState('useIsometric') ?? true;
        const tile   = getTileUnderMouse(mx, my, originX, originY, shardData, wrapper, useIso);
        if (!tile) return;

        console.log('[ClickDebug]', {
        mouseX: mx,
        mouseY: my,
        scrollLeft: wrapper.scrollLeft,
        scrollTop: wrapper.scrollTop,
        tile
        });


    // Update state & stats panel
    setState('selectedTile', tile);
    document.getElementById('statsContent').textContent = JSON.stringify(tile, null, 2);

    // 1) Redraw map + grid with new selection baked in
    renderFn(ctx, shardData, tile, originX, originY, getState('showGrid'));

    // 2) Draw the golden highlight on top
    drawHighlight(ctx, tile, originX, originY, useIso);

    // 3) Force‐open info panel on one click
    const panel = document.getElementById('infoPanel');
    panel.style.display = 'block';
    const btn = document.querySelector('button.panel-toggle[data-target="infoPanel"]');
    if (btn) btn.querySelector('.toggle-icon').textContent = '–';
  });
}
