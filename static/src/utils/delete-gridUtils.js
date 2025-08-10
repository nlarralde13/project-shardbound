// static/src/utils/gridUtils.js

import {
  TILE_WIDTH,
  TILE_HEIGHT,
  ORTHO_TILE_SIZE as BASE_ORTHO_SIZE
} from '../config/mapConfig.js';

/** Iso tile(x,y) → screen coords */
export function isoToScreen(x, y, originX, originY) {
  return {
    x: originX + (x - y) * (TILE_WIDTH / 2),
    y: originY + (x + y) * (TILE_HEIGHT / 2)
  };
}

/** Square tile(x,y) → screen coords */
export function orthoToScreen(x, y, tileSize = BASE_ORTHO_SIZE) {
  return {
    x: x * tileSize,
    y: y * tileSize
  };
}

/** Screen → iso tile index */
export function screenToIso(mouseX, mouseY, originX, originY, scrollX, scrollY) {
  const ax = mouseX + scrollX - originX;
  const ay = mouseY + scrollY - originY;
  const dx = ax / (TILE_WIDTH / 2);
  const dy = ay / (TILE_HEIGHT / 2);
  return {
    tx: Math.floor((dx + dy) / 2),
    ty: Math.floor((dy - dx) / 2)
  };
}

/** Screen → ortho tile index */
export function screenToOrtho(mouseX, mouseY, scrollX, scrollY, tileSize = BASE_ORTHO_SIZE) {
  return {
    tx: Math.floor((mouseX + scrollX) / tileSize),
    ty: Math.floor((mouseY + scrollY) / tileSize)
  };
}

/**
 * Compute the optimal orthographic tile size so that the full shard
 * (shardWidth × shardHeight) exactly fills the wrapper (no scrollbars).
 *
 * @param {number} wrapperW  width of #viewportWrapper in px
 * @param {number} wrapperH  height of #viewportWrapper in px
 * @param {number} shardW    number of cols in shard
 * @param {number} shardH    number of rows in shard
 * @returns {number}         tileSize in px
 */
export function fitOrthoTileSize(wrapperW, wrapperH, shardW, shardH) {
  const sizeX = wrapperW / shardW;
  const sizeY = wrapperH / shardH;
  return Math.floor(Math.min(sizeX, sizeY));
}

/**
 * Compute the scale factor and isometric origin offsets so that
 * the full isometric diamond‐grid (shardW × shardH) fits within
 * the wrapper without scrollbars.
 *
 * @param {number} wrapperW   width of #viewportWrapper
 * @param {number} wrapperH   height of #viewportWrapper
 * @param {number} shardW     number of cols
 * @param {number} shardH     number of rows
 * @returns {{scale: number, originX: number, originY: number}}
 */
export function fitIsoTransform(wrapperW, wrapperH, shardW, shardH) {
  // Unscaled map pixel dimensions
  const mapW = (shardW + shardH) * (TILE_WIDTH / 2);
  const mapH = (shardW + shardH) * (TILE_HEIGHT / 2);

  // Uniform scale to fit both width & height
  const scale = Math.min(wrapperW / mapW, wrapperH / mapH);

  // Center the diamond horizontally, and align top at y=0 (you can tweak originY)
  const originX = wrapperW / 2;
  const originY = 0;

  return { scale, originX, originY };
}
