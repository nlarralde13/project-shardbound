/**
 * Computes which tile (if any) is under the given mouse coords.
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
  tileW, tileH,
  originX, originY,
  shard, canvas
) {
  // find the real scroll container (the one styled overflow: scroll)
  const scrollContainer = canvas.closest('#viewport');
  const scrollLeft = scrollContainer?.scrollLeft  ?? 0;
  const scrollTop  = scrollContainer?.scrollTop   ?? 0;
  const zoom       = window.currentZoom || 1;

  // undo scroll + zoom + origin
  const dx = (mouseX + scrollLeft - originX) / zoom;
  const dy = (mouseY + scrollTop  - originY) / zoom;

  const x = Math.floor((dx / (tileW/2) + dy / (tileH/2)) / 2);
  const y = Math.floor((dy / (tileH/2) - dx / (tileW/2)) / 2);

  console.log(`[tooltip] calc iso coords → (${x},${y}) after scroll (${scrollLeft},${scrollTop})`);

  if (x >= 0 && x < shard.width && y >= 0 && y < shard.height) {
    return { ...shard.tiles[y][x], x, y };
  } else {
    return null;
  }
}
