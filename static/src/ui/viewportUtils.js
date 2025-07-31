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

