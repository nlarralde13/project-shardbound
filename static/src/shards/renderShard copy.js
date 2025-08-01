// static/src/shards/renderShard.js

import { TILE_WIDTH, TILE_HEIGHT, ORTHO_TILE_SIZE } from '../config/mapConfig.js';

/**
 * Renders the shard map onto the canvas.
 * Supports both isometric (diamond) and orthographic (square) views.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} shardData       - { width, height, tiles[y][x] }
 * @param {number} originX         - Iso horizontal offset
 * @param {number} originY         - Iso vertical offset
 * @param {boolean} showGrid
 * @param {boolean} useIsometric
 */
export function renderShard(
  ctx,
  shardData,
  selectedTile = null,
  originX,
  originY,
  showGrid = false,
  useIsometric = true
) {
  if (!shardData?.tiles) return;

  const { width: cols, height: rows } = shardData;
  const canvas = ctx.canvas;

  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const biomeColors = {
    grass: '#4CAF50', forest: '#2E7D32',
    water: '#2196F3', mountain: '#9E9E9E'
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = shardData.tiles[y][x];
      let sx, sy;

      if (useIsometric) {
        // diamond layout
        sx = originX + (x - y) * (TILE_WIDTH/2);
        sy = originY + (x + y) * (TILE_HEIGHT/2);

        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.moveTo(sx, sy + TILE_HEIGHT/2);
        ctx.lineTo(sx + TILE_WIDTH/2, sy + TILE_HEIGHT);
        ctx.lineTo(sx, sy + TILE_HEIGHT*1.5);
        ctx.lineTo(sx - TILE_WIDTH/2, sy + TILE_HEIGHT);
        ctx.closePath();
        ctx.fill();

        // tile
        ctx.fillStyle = biomeColors[tile.biome] || '#555';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + TILE_WIDTH/2, sy + TILE_HEIGHT/2);
        ctx.lineTo(sx, sy + TILE_HEIGHT);
        ctx.lineTo(sx - TILE_WIDTH/2, sy + TILE_HEIGHT/2);
        ctx.closePath();
        ctx.fill();

        if (showGrid) {
          ctx.strokeStyle = 'rgba(255,0,0,0.4)';
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + TILE_WIDTH/2, sy + TILE_HEIGHT/2);
          ctx.lineTo(sx, sy + TILE_HEIGHT);
          ctx.lineTo(sx - TILE_WIDTH/2, sy + TILE_HEIGHT/2);
          ctx.closePath();
          ctx.stroke();
        }

      } else {
        // square layout
        sx = x * ORTHO_TILE_SIZE;
        sy = y * ORTHO_TILE_SIZE;

        ctx.fillStyle = biomeColors[tile.biome] || '#555';
        ctx.fillRect(sx, sy, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE);

        if (showGrid) {
          ctx.strokeStyle = 'rgba(255,0,0,0.4)';
          ctx.lineWidth   = 1;
          ctx.strokeRect(sx, sy, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE);
        }
      }
    }
  }
}
