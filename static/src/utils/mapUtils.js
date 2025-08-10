// static/src/utils/mapUtils.js
// ────────────────────────────────────────────────────────────────
// Master map math utilities (ISO + ORTHO) for Shardbound.
// Combines former gridUtils + tileUtils and adds centralized
// origin/fit calculations so every module stays in sync.
//
// Exports:
//  • isoToScreen, orthoToScreen
//  • screenToIso, screenToOrtho
//  • getTileUnderMouseIso, getTileUnderMouseOrtho
//  • fitIsoTransform, fitOrthoTileSize
//  • computeIsoOrigin
//  • updateDevStatsPanel (migrated from tileUtils)
// ────────────────────────────────────────────────────────────────

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  ORTHO_TILE_SIZE as BASE_ORTHO_SIZE,
} from '../config/mapConfig.js';
import { getZoomLevel } from '../ui/camera.js';

/* ==============================================================
 *  Core coordinate transforms
 * ============================================================== */

/** Iso tile(x,y) → screen coords */
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

/**
 * Screen → iso tile indices (integer grid).
 * Accounts for scroll and optional zoom+origin.
 */
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

/**
 * Screen → ortho tile indices (integer grid).
 * Accounts for scroll and optional zoom.
 */
export function screenToOrtho(mouseX, mouseY, scrollX = 0, scrollY = 0, tileSize = BASE_ORTHO_SIZE, zoom = 1) {
  return {
    tx: Math.floor((mouseX + scrollX) / (tileSize * zoom)),
    ty: Math.floor((mouseY + scrollY) / (tileSize * zoom)),
  };
}

/* ==============================================================
 *  Unified hit-testing helpers
 * ============================================================== */

/**
 * Get the iso tile under the mouse.
 * Automatically reads scroll from the canvas wrapper and zoom from camera.
 *
 * @param {number} mouseX  – clientX relative to the canvas box
 * @param {number} mouseY  – clientY relative to the canvas box
 * @param {HTMLCanvasElement} canvas
 * @param {{width:number,height:number,tiles:any[][]}} shard
 * @param {{originX:number,originY:number}} origin
 * @returns {{x:number,y:number, ...tile}|null}
 */
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

/**
 * Get the ortho tile under the mouse.
 */
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

/* ==============================================================
 *  Fitting / origin calculations (single source of truth)
 * ============================================================== */

/**
 * Compute a uniform scale and an isometric origin so the entire shard fits
 * in the given wrapper. This keeps everyone using the same origin/scale.
 *
 * @returns {{scale:number, originX:number, originY:number, mapW:number, mapH:number}}
 */
export function fitIsoTransform(wrapperW, wrapperH, shardW, shardH, tileW = TILE_WIDTH, tileH = TILE_HEIGHT) {
  // unscaled iso map pixel bounds (diamond’s bounding box)
  const mapW = (shardW + shardH) * (tileW / 2);
  const mapH = (shardW + shardH) * (tileH / 2);

  // best uniform scale to fit inside wrapper
  const scale = Math.min(wrapperW / mapW, wrapperH / mapH);

  // center horizontally; start near the top with a small padding
  const originX = wrapperW / 2;
  const originY = Math.max(0, (wrapperH - mapH * scale) * 0.1); // 10% top padding

  return { scale, originX, originY, mapW, mapH };
}

/**
 * Orthographic fit: tile size so the whole shard fills the wrapper.
 */
export function fitOrthoTileSize(wrapperW, wrapperH, shardW, shardH) {
  const sizeX = wrapperW / shardW;
  const sizeY = wrapperH / shardH;
  return Math.floor(Math.min(sizeX, sizeY));
}

/**
 * Simple helper to (re)compute an iso origin when canvas or wrapper changes.
 * Keeps origin logic consistent across modules.
 */
export function computeIsoOrigin(canvasWidth, canvasHeight) {
  // horizontally centered; reasonable top anchor
  return {
    originX: canvasWidth / 2,
    originY: 40,
  };
}

/* ==============================================================
 *  Dev helpers (migrated from tileUtils)
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
      // TODO: hook to generateMiniShard / shardLoader
    });

    edit?.addEventListener('click', () => {
      console.log('[Action] 🛠 Edit Room triggered for tile:', tile);
      // TODO: open tile editor UI
    });
  }
}

/* ==============================================================
 *  Notes for integration
 * ==============================================================
 * 1) Replace duplications:
 *    - Remove getTileUnderMouse from tooltip.js/viewportUtils.js
 *      and import { getTileUnderMouseIso } from './utils/mapUtils.js'
 *
 * 2) Centralize origin/fit:
 *    - On init or resize:
 *        const wrapper = document.getElementById('viewportWrapper');
 *        const { scale, originX, originY } = fitIsoTransform(
 *          wrapper.clientWidth, wrapper.clientHeight, shard.width, shard.height
 *        );
 *        ctx.setTransform(scale, 0, 0, scale, 0, 0);
 *        const origin = { originX, originY };
 *
 * 3) Click/hover hit test:
 *    canvas.addEventListener('mousemove', (e) => {
 *      const rect = canvas.getBoundingClientRect();
 *      const tile = getTileUnderMouseIso(
 *        e.clientX - rect.left,
 *        e.clientY - rect.top,
 *        canvas,
 *        shard,
 *        origin
 *      );
 *      // re-render with hover highlight if desired
 *    });
 *
 * 4) Keep TILE_WIDTH/HEIGHT changes and zoom logic in one place.
 */
