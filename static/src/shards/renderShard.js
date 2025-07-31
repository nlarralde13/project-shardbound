// renderShard.js
// Manages full-canvas sizing and draws the isometric shard with dynamic centering & highlights

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';

let lastHovered = { x: -1, y: -1 };

/**
 * renderShard
 * Resizes the canvas to fit the entire shard, centers the origin,
 * and draws all tiles plus optional highlight for the selected tile.
 * @param {CanvasRenderingContext2D} ctx   - 2D rendering context of the canvas
 * @param {Object} shardData               - shard object containing width, height, and tiles[y][x]
 * @param {Object|null} selectedTile       - { x, y } of the tile to outline, or null
 */
export function renderShard(ctx, shardData, selectedTile = null) {
  if (!shardData || !shardData.tiles) return;

  // 1) Resize canvas to fit all tiles
  const canvas = ctx.canvas;
  const cols = shardData.width;
  const rows = shardData.height;
  canvas.width  = cols * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT + TILE_HEIGHT;

  // 2) Compute origin so first tile is centered horizontally
  const originX = canvas.width / 2;
  const originY = TILE_HEIGHT / 2;

  // 3) Clear & set background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 4) Draw each tile
  const biomeColors = {
    grass: '#4CAF50',
    forest: '#2E7D32',
    water: '#2196F3',
    mountain: '#9E9E9E'
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = shardData.tiles[y][x];
      const biome = tile.biome || 'grass';

      // Compute isometric screen X/Y
      const screenX = originX + (x - y) * (TILE_WIDTH / 2);
      const screenY = originY + (x + y) * (TILE_HEIGHT / 2);

      // Draw shadow under tile
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + TILE_HEIGHT/2);
      ctx.lineTo(screenX + TILE_WIDTH/2, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT*1.5);
      ctx.lineTo(screenX - TILE_WIDTH/2, screenY + TILE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Draw tile shape
      ctx.fillStyle = biomeColors[biome] || '#555';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + TILE_WIDTH/2, screenY + TILE_HEIGHT/2);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX - TILE_WIDTH/2, screenY + TILE_HEIGHT/2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 5) Highlight selected tile if provided
  if (selectedTile) {
    const { x, y } = selectedTile;
    const sx = originX + (x - y) * (TILE_WIDTH / 2);
    const sy = originY + (x + y) * (TILE_HEIGHT / 2);

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH/2, sy + TILE_HEIGHT/2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH/2, sy + TILE_HEIGHT/2);
    ctx.closePath();
    ctx.stroke();
  }
}
