import { getZoomLevel } from './camera.js';


/**
 * Computes which tile (if any) is under the given mouse coords.
 *
 * 
 * @param {number} mouseX  x relative to canvas client area
 * @param {number} mouseY  y relative to canvas client area
 * @param {number} tileW   tile width
 * @param {number} tileH   tile height
 * @param {number} originX same originX you passed to renderShard
 * @param {number} originY same originY you passed to renderShard
 * @param {object} shard   the shard data (with width/height/tiles[])
 * @param {HTMLCanvasElement} canvas  the canvas element itself
 */
export function getTileUnderMouse(
  mouseX, mouseY,
  TILE_WIDTH,TILE_HEIGHT,
  originX, originY,
  shardData,
  wrapper
 ) 
 
 {
  const scrollLeft = wrapper.scrollLeft;
  const scrollTop = wrapper.scrollTop;
  const zoom = getZoomLevel();

  // Convert screen coords to world coords
  const dx = (mouseX + scrollLeft - originX) / zoom;
  const dy = (mouseY + scrollTop - originY) / zoom;

  const x = Math.floor((dx / (TILE_WIDTH/2) + dy / (TILE_HEIGHT/2)) / 2);
  const y = Math.floor((dy / (TILE_HEIGHT/2) - dx / (TILE_WIDTH/2)) / 2);

  if (x < 0 || x >= shardData.width || y < 0 || y >= shardData.height) {
    return null;
  }
  return { ...shardData.tiles[y][x], x, y };
}
