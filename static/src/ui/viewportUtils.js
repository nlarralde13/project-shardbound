// ================================================
// viewportUtils.js (updated)
// ================================================

import { getZoomLevel } from './camera.js';

/**
 * Calculates how many columns/rows fit in the viewport wrapper.
 * @param {number} tileWidth
 * @param {number} tileHeight
 * @returns {{cols:number,rows:number}}
 */
export function calculateViewportSize(tileWidth, tileHeight) {
  const wrapper = document.getElementById('viewportWrapper');
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  const cols = Math.floor(w / tileWidth);
  const rows = Math.floor(h / tileHeight);
  return { cols, rows };
}

/**
 * Determines which tile is under the given mouse position,
 * accounting for scroll and zoom.
 * @param {number} mouseX - x within canvas
 * @param {number} mouseY - y within canvas
 * @param {number} tileW
 * @param {number} tileH
 * @param {number} originX
 * @param {number} originY
 * @param {object} shard - shard data
 * @param {HTMLElement} wrapper - scrolling container
 */
export function getTileUnderMouse(
  mouseX, mouseY,
  tileW, tileH,
  originX, originY,
  shard,
  wrapper
) {
  const scrollLeft = wrapper.scrollLeft;
  const scrollTop = wrapper.scrollTop;
  const zoom = getZoomLevel();

  // Convert screen coords to world coords
  const dx = (mouseX + scrollLeft - originX) / zoom;
  const dy = (mouseY + scrollTop - originY) / zoom;

  const x = Math.floor((dx / (tileW/2) + dy / (tileH/2)) / 2);
  const y = Math.floor((dy / (tileH/2) - dx / (tileW/2)) / 2);

  if (x < 0 || x >= shard.width || y < 0 || y >= shard.height) {
    return null;
  }
  return { ...shard.tiles[y][x], x, y };
}
