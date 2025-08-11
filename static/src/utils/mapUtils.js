// static/src/utils/mapUtils.js
// Master map math utilities (ISO + ORTHO). Steady-state sizing & robust fit.

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  ORTHO_TILE_SIZE as BASE_ORTHO_SIZE,
} from '../config/mapConfig.js';
import { getZoomLevel } from '../ui/camera.js';

/* ============================================================== *
 *  Core coordinate transforms
 * ============================================================== */

export function isoToScreen(x, y, originX, originY, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  return {
    x: originX + (x - y) * (tileW / 2),
    y: originY + (x + y) * (tileH / 2),
  };
}

export function orthoToScreen(x, y, tileSize = BASE_ORTHO_SIZE) {
  return { x: x * tileSize, y: y * tileSize };
}

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

export function screenToOrtho(mouseX, mouseY, scrollX = 0, scrollY = 0, tileSize = BASE_ORTHO_SIZE, zoom = 1) {
  return {
    tx: Math.floor((mouseX + scrollX) / (tileSize * zoom)),
    ty: Math.floor((mouseY + scrollY) / (tileSize * zoom)),
  };
}

/* ============================================================== *
 *  Unified hit-testing helpers
 * ============================================================== */

// utils/mapUtils.js  (replace getTileUnderMouseIso with this safer version)
// Robust, zoom/pan-aware, diamond-accurate iso hit test
// utils/mapUtils.js — drop-in replacement for getTileUnderMouseIso

// utils/mapUtils.js — drop-in replacement for getTileUnderMouseIso

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

  // Derive actual on-screen scale from CSS vs backing pixels (robust to CSS transforms)
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width  / (canvas.width  || 1);
  const sy = rect.height / (canvas.height || 1);
  const cssScale = (isFinite(sx) && isFinite(sy)) ? (sx + sy) * 0.5 : 1;

  // Convert mouse from CSS pixels → backing pixels (pre-zoom coords)
  const mxAbs = mouseX / cssScale;
  const myAbs = mouseY / cssScale;

  const hw = tileW * 0.5;
  const hh = tileH * 0.5;

  // Robust dimensions
  const w = Number.isFinite(shard?.width)  ? shard.width  : (Array.isArray(shard?.tiles?.[0]) ? shard.tiles[0].length : 0);
  const h = Number.isFinite(shard?.height) ? shard.height : (Array.isArray(shard?.tiles)      ? shard.tiles.length   : 0);
  if (w <= 0 || h <= 0) return null;

  // Coarse iso -> tile estimate
  const ax = mxAbs - origin.originX;
  const ay = myAbs - origin.originY;
  const dx = ax / hw;
  const dy = ay / hh;
  const estTx = Math.floor((dx + dy) * 0.5);
  const estTy = Math.floor((dy - dx) * 0.5);

  // Helpers
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
    return (lx + ly) <= 1.00001; // tiny epsilon for borders
  };

  // 1) Try coarse
  if (inDiamond(estTx, estTy)) {
    const cell = shard.tiles?.[estTy]?.[estTx];
    return cell ? { ...cell, x: estTx, y: estTy } : null;
  }

  // 2) Cardials then diagonals
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

  // 3) Fallback: nearest center
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





export function getTileUnderMouseOrtho(mouseX, mouseY, canvas, shard, tileSize = BASE_ORTHO_SIZE) {
  if (!canvas || !shard) return null;

  const wrapper = canvas.parentElement;
  const scrollX = wrapper?.scrollLeft ?? 0;
  const scrollY = wrapper?.scrollTop ?? 0;
  const zoom = getZoomLevel?.() ?? 1;

  const { tx, ty } = screenToOrtho(mouseX, mouseY, scrollX, scrollY, tileSize, zoom);
  if (tx < 0 || ty < 0 || tx >= shard.width || ty >= shard.height) return null;
  return { ...shard.tiles[ty][tx], x: tx, y: ty };
}

/* ============================================================== *
 *  Fitting / origin calculations (robust)
 * ============================================================== */

export function fitIsoTransform(wrapperW, wrapperH, shardW, shardH, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  // Guard against 0×0 (e.g., wrapper hidden). Fall back to viewport size.
  const w = Math.max(1, Number(wrapperW) || 0) || window.innerWidth  || 1;
  const h = Math.max(1, Number(wrapperH) || 0) || window.innerHeight || 1;

  const mapW = (shardW + shardH) * (tileW / 2);
  const mapH = (shardW + shardH) * (tileH / 2);

  const scale = Math.min(w / mapW, h / mapH);

  // Center horizontally; a bit of top padding to keep diamond in view
  const originX = w / 2;
  const originY = Math.max(0, (h - mapH * scale) * 0.1);

  return { scale, originX, originY, mapW, mapH };
}

export function fitOrthoTileSize(wrapperW, wrapperH, shardW, shardH) {
  const w = Math.max(1, Number(wrapperW) || 0) || window.innerWidth  || 1;
  const h = Math.max(1, Number(wrapperH) || 0) || window.innerHeight || 1;
  const sizeX = w / shardW;
  const sizeY = h / shardH;
  return Math.floor(Math.min(sizeX, sizeY));
}

export function computeIsoOrigin(canvasWidth, canvasHeight) {
  return {
    originX: Math.max(1, canvasWidth) / 2,
    originY: 40,
  };
}

/* ============================================================== *
 *  Dev helpers
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

    const explore = document.getElementById('exploreTile');
    const edit = document.getElementById('editTile');

    explore?.addEventListener('click', () => {
      console.log('[Action] ▶ Explore triggered for tile:', tile);
      // hook generateMiniShard / shardLoader as needed
    });

    edit?.addEventListener('click', () => {
      console.log('[Action] 🛠 Edit Room triggered for tile:', tile);
      // TODO: open tile editor UI
    });
  }
}

/* Notes:
 * 1) Always unhide #viewportWrapper before calling sizing/fit functions.
 * 2) These helpers now tolerate 0×0 inputs but visible measurements are best.
 */
