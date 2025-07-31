// /static/src/ui/viewportUtils.js

/**
 * Given a click or move event on the canvas, convert that to an (x,y) tile in the shard.
 *
 * @param {MouseEvent} e         the click/move event
 * @param {HTMLCanvasElement} canvas
 * @param {number} tileWidth
 * @param {number} tileHeight
 * @param {number} originX       screen-space X of the isometric origin
 * @param {number} originY       screen-space Y of the isometric origin
 * @param {object} shard         the loaded shard JSON { width, height, tiles[][] }
 * @returns { { x:number, y:number } & tileData | null }
 */
export function getTileUnderMouse(e, canvas, tileWidth, tileHeight, originX, originY, shard) {
  // find the scroll container (we wrap <canvas> in #viewportWrapper)
  const wrapper =
    document.getElementById('canvasWrapper') ||
    document.getElementById('viewportWrapper') ||
    canvas.parentElement ||
    canvas;
  const scrollLeft = wrapper.scrollLeft || 0;
  const scrollTop  = wrapper.scrollTop  || 0;

  // mouse pos relative to canvas, plus scroll offset
  const bounds = canvas.getBoundingClientRect();
  const mouseX = e.clientX - bounds.left + scrollLeft;
  const mouseY = e.clientY - bounds.top  + scrollTop;

  // translate into isometric grid coords
  const dx = mouseX - originX;
  const dy = mouseY - originY;
  const isoX = Math.floor((dx / (tileWidth/2) + dy / (tileHeight/2)) / 2);
  const isoY = Math.floor((dy / (tileHeight/2) - dx / (tileWidth/2)) / 2);

  if (isoX >= 0 && isoX < shard.width && isoY >= 0 && isoY < shard.height) {
    return { ...shard.tiles[isoY][isoX], x: isoX, y: isoY };
  }
  return null;
}

/**
 * Calculate how many columns & rows of tiles fit into the visible viewport.
 * (You can keep your existing implementation here.)
 */
export function calculateViewportSize(tileWidth, tileHeight) {
  // your existing logic...
  // e.g.:
  const wrapper = document.getElementById('viewportWrapper');
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  return {
    cols: Math.ceil(w / tileWidth) + 1,
    rows: Math.ceil(h / tileHeight) + 1
  };
}
