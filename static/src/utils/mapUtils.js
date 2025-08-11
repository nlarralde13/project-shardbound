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

export function getTileUnderMouseIso(mouseX, mouseY, canvas, shard, origin, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  if (!canvas || !shard) return null;

  const wrapper = canvas.parentElement; // expected scroll container
  const scrollX = wrapper?.scrollLeft ?? 0;
  const scrollY = wrapper?.scrollTop ?? 0;
  const zoom = getZoomLevel?.() ?? 1;

  const { tx, ty } = screenToIso(
    mouseX,
    mouseY,
    origin.originX,
    origin.originY,
    scrollX,
    scrollY,
    tileW,
    tileH,
    zoom
  );

  if (tx < 0 || ty < 0 || tx >= shard.width || ty >= shard.height) return null;
  return { ...shard.tiles[ty][tx], x: tx, y: ty };
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
