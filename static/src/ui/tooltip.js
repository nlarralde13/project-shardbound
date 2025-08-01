
// static/src/ui/tooltip.js

import { getZoomLevel } from './camera.js';
import { renderShard }  from '../shards/renderShard.js';
import { togglePanel }  from './panels.js';
import { isoToScreen, orthoToScreen, screenToIso, screenToOrtho } from '../utils/gridUtils.js';
import { getState, setState } from '../utils/state.js';
import { TILE_WIDTH, TILE_HEIGHT, ORTHO_TILE_SIZE } from '../config/mapConfig.js';

/**
 * Attaches click listener for tile selection.
 */
export function initTileClick({ canvas, wrapper, shardData, originX, originY, ctx, renderFn }) {
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const scale = getZoomLevel();
    const scrollX = wrapper.scrollLeft;
    const scrollY = wrapper.scrollTop;

    const mouseX = (e.clientX - rect.left + scrollX) / scale;
    const mouseY = (e.clientY - rect.top  + scrollY) / scale;

    const useIso = getState('useIsometric') ?? true;
    const { tx, ty } = useIso
      ? screenToIso(mouseX, mouseY, originX, originY, scrollX, scrollY)
      : screenToOrtho(mouseX, mouseY, scrollX, scrollY);

    if (tx < 0 || ty < 0 || tx >= shardData.width || ty >= shardData.height) return;
    const tile = { ...shardData.tiles[ty][tx], x: tx, y: ty };

    setState('selectedTile', tile);
    document.getElementById('statsContent').textContent = JSON.stringify(tile, null, 2);

    // Redraw map + highlight
    renderFn(ctx, shardData, tile, originX, originY, getState('showGrid'));
    const { x: hx, y: hy } = useIso
      ? isoToScreen(tx, ty, originX, originY)
      : orthoToScreen(tx, ty);
    ctx.strokeStyle='#FFD700'; ctx.lineWidth=2;
    if (useIso) {
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + TILE_WIDTH/2, hy + TILE_HEIGHT/2);
      ctx.lineTo(hx, hy + TILE_HEIGHT);
      ctx.lineTo(hx - TILE_WIDTH/2, hy + TILE_HEIGHT/2);
      ctx.closePath(); ctx.stroke();
    } else {
      ctx.strokeRect(hx, hy, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE);
    }

    // Open info panel
    const panel = document.getElementById('infoPanel');
    if (panel) panel.style.display = 'block';
    const btn = document.querySelector('button.panel-toggle[data-target="infoPanel"]');
    if (btn) btn.querySelector('.toggle-icon').textContent = '–';

    console.log('[TileClick]', { mouseX, mouseY, scrollX, scrollY, tx, ty });
  });
}
