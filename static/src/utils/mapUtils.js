// utils/mapUtils.js
// Master map math utilities (ISO + ORTHO) for Shardbound.
// - iso/ortho transforms
// - robust iso hit-test (CSS zoom aware, pan/origin aware)
// - fit/origin helpers
// - dev panel updater

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  ORTHO_TILE_SIZE as BASE_ORTHO_SIZE,
} from '../config/mapConfig.js';

/* ============================================================== *
 *  Core coordinate transforms
 * ============================================================== */

/** Iso tile(x,y) → screen coords (top vertex) */
export function isoToScreen(x, y, originX, originY, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  return {
    x: originX + (x - y) * (tileW / 2),
    y: originY + (x + y) * (tileH / 2),
  };
}

/** Square/orthographic tile(x,y) → screen coords */
export function orthoToScreen(x, y, tileSize = BASE_ORTHO_SIZE) {
  return { x: x * tileSize, y: y * tileSize };
}

/** Screen → iso tile estimate (integer grid).
 *  This is a math helper; for picking prefer getTileUnderMouseIso below. */
export function screenToIso(
  mouseX,
  mouseY,
  originX,
  originY,
  scrollX = 0,
  scrollY = 0,
  tileW = TILE_WIDTH,
  tileH = TILE_HEIGHT,
  zoom = 1
) {
  const ax = (mouseX + scrollX - originX) / zoom;
  const ay = (mouseY + scrollY - originY) / zoom;
  const dx = ax / (tileW / 2);
  const dy = ay / (tileH / 2);

  return {
    tx: Math.floor((dx + dy) / 2),
    ty: Math.floor((dy - dx) / 2),
  };
}

/** Screen → ortho tile indices (integer grid). */
export function screenToOrtho(mouseX, mouseY, scrollX = 0, scrollY = 0, tileSize = BASE_ORTHO_SIZE, zoom = 1) {
  return {
    tx: Math.floor((mouseX + scrollX) / (tileSize * zoom)),
    ty: Math.floor((mouseY + scrollY) / (tileSize * zoom)),
  };
}

/* ============================================================== *
 *  Robust iso hit-testing (CSS zoom aware, pan/origin aware)
 * ============================================================== */

/**
 * Get the iso tile under the mouse using a diamond-inclusion test.
 * Works with CSS transforms (scale) and internal panning.
 *
 * @param {number} mouseX   clientX relative to canvas box (rect-left)
 * @param {number} mouseY   clientY relative to canvas box (rect-top)
 * @param {HTMLCanvasElement} canvas
 * @param {{width:number,height:number,tiles:any[][]}} shard
 * @param {{originX:number, originY:number}} origin
 * @param {number} tileW
 * @param {number} tileH
 * @returns {{x:number,y:number, ...tile}|null}
 */
export function getTileUnderMouseIso(
  mouseX,
  mouseY,
  canvas,
  shard,
  origin,
  tileW = TILE_WIDTH,
  tileH = TILE_HEIGHT
) {
  if (!canvas || !shard) return null;

  // Derive actual on-screen CSS scale from canvas box vs backing pixels
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width  / (canvas.width  || 1);
  const sy = rect.height / (canvas.height || 1);
  const cssScale = (isFinite(sx) && isFinite(sy)) ? (sx + sy) * 0.5 : 1;

  // Convert mouse from CSS px → backing px (pre-zoom coords)
  const mxAbs = mouseX / cssScale;
  const myAbs = mouseY / cssScale;

  const hw = tileW * 0.5;
  const hh = tileH * 0.5;

  // Dimensions (robust for shard/slice/room)
  const w = Number.isFinite(shard?.width)  ? shard.width  : (Array.isArray(shard?.tiles?.[0]) ? shard.tiles[0].length : 0);
  const h = Number.isFinite(shard?.height) ? shard.height : (Array.isArray(shard?.tiles)      ? shard.tiles.length   : 0);
  if (w <= 0 || h <= 0) return null;

  // Coarse estimate in tile space
  const ax = mxAbs - origin.originX;
  const ay = myAbs - origin.originY;
  const dx = ax / hw;
  const dy = ay / hh;
  const estTx = Math.floor((dx + dy) * 0.5);
  const estTy = Math.floor((dy - dx) * 0.5);

  const centerOf = (tx, ty) => {
    const x = origin.originX + (tx - ty) * hw;
    const y = origin.originY + (tx + ty) * hh + hh; // center = top + hh
    return { x, y };
  };
  const inDiamond = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    const c = centerOf(tx, ty);
    const lx = Math.abs(mxAbs - c.x) / hw;
    const ly = Math.abs(myAbs - c.y) / hh;
    return (lx + ly) <= 1.00001; // epsilon for edges
  };

  // 1) Coarse tile
  if (inDiamond(estTx, estTy)) {
    const cell = shard.tiles?.[estTy]?.[estTx];
    return cell ? { ...cell, x: estTx, y: estTy } : null;
  }
  // 2) Neighbors (cardinals first, then diagonals)
  const neighbors = [
    [ 1,  0], [-1,  0], [ 0,  1], [ 0, -1],
    [ 1,  1], [-1, -1], [ 1, -1], [-1,  1],
  ];
  for (const [ox, oy] of neighbors) {
    const tx = estTx + ox, ty = estTy + oy;
    if (!inDiamond(tx, ty)) continue;
    const cell = shard.tiles?.[ty]?.[tx];
    if (cell) return { ...cell, x: tx, y: ty };
  }

  // 3) Fallback: nearest center (rare)
  let best = null, bestD2 = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const tx = estTx + ox, ty = estTy + oy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const c = centerOf(tx, ty);
      const d2 = (mxAbs - c.x) ** 2 + (myAbs - c.y) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = { tx, ty }; }
    }
  }
  if (!best) return null;
  const cell = shard.tiles?.[best.ty]?.[best.tx];
  return cell ? { ...cell, x: best.tx, y: best.ty } : null;
}

/* ============================================================== *
 *  Fitting / origin calculations
 * ============================================================== */

/**
 * Compute a uniform scale and an isometric origin so the entire shard fits
 * in the given wrapper. This returns mapW/mapH (unscaled bbox) if needed.
 */
export function fitIsoTransform(wrapperW, wrapperH, shardW, shardH, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  const mapW = (shardW + shardH) * (tileW / 2);
  const mapH = (shardW + shardH) * (tileH / 2);
  const scale = Math.min(wrapperW / mapW, wrapperH / mapH);
  const originX = wrapperW / 2;
  const originY = Math.max(0, (wrapperH - mapH * scale) * 0.1); // slight top padding
  return { scale, originX, originY, mapW, mapH };
}

/** Orthographic fit: tile size so the whole shard fills the wrapper. */
export function fitOrthoTileSize(wrapperW, wrapperH, shardW, shardH) {
  const sizeX = wrapperW / shardW;
  const sizeY = wrapperH / shardH;
  return Math.floor(Math.min(sizeX, sizeY));
}

/** Simple helper to (re)compute an iso origin from canvas size. */
export function computeIsoOrigin(canvasWidth, canvasHeight) {
  return { originX: canvasWidth / 2, originY: 40 };
}

/* ============================================================== *
 *  Dev helpers (left info panel)
 * ============================================================== */

export function updateDevStatsPanel(tile) {
  const statsBox = document.getElementById('statsContent');
  if (statsBox) {
    statsBox.innerHTML = `<pre>${JSON.stringify(tile, null, 2)}</pre>`;
  }

  const actionsBox = document.getElementById('tileActions');
  if (actionsBox) {
    actionsBox.innerHTML = `
      <button id="exploreTile">▶ Explore</button>
      <button id="editTile">🛠 Edit Room</button>
    `;

    document.getElementById('exploreTile')?.addEventListener('click', () => {
      console.log('[Action] ▶ Explore tile:', tile);
      // hook into your Explore flow if desired
    });
    document.getElementById('editTile')?.addEventListener('click', () => {
      console.log('[Action] 🛠 Edit Room for tile:', tile);
    });
  }
}
