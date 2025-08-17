// Renders an isometric shard with hover/selection outlines.
// Usage: renderShard(ctx, shardData, { hoverTile, selectedTile, origin })

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { computeIsoOrigin, isoToScreen } from '../utils/mapUtils.js';

const biomeColors = {
  grass:    '#4CAF50',
  forest:   '#2E7D32',
  water:    '#2196F3',
  mountain: '#9E9E9E',
  desert:   '#D4A373',
  tundra:   '#A0C4FF',
};

export function renderShard(ctx, shardData, thirdArg = null) {
  if (!shardData || !shardData.tiles) return;

  // Back-compat: renderShard(ctx, shard, selectedTile)
  const opts = (thirdArg && typeof thirdArg === 'object' && !('biome' in thirdArg))
    ? thirdArg
    : { selectedTile: thirdArg || null };

  const { hoverTile = null, selectedTile = null } = opts;
  const origin = opts.origin || computeIsoOrigin(ctx.canvas.width, ctx.canvas.height);

  // clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // tiles
  for (let y = 0; y < shardData.height; y++) {
    for (let x = 0; x < shardData.width; x++) {
      const tile = shardData.tiles[y][x];
      const biome = tile.biome || 'grass';
      const { x: sx, y: sy } = isoToScreen(x, y, origin.originX, origin.originY, TILE_WIDTH, TILE_HEIGHT);

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(sx, sy + TILE_HEIGHT / 2);
      ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT);
      ctx.lineTo(sx, sy + TILE_HEIGHT * 1.5);
      ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // tile
      ctx.fillStyle = biomeColors[biome] || '#555';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
      ctx.lineTo(sx, sy + TILE_HEIGHT);
      ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // hover outline
  if (hoverTile) {
    const { x, y } = hoverTile;
    const { x: sx, y: sy } = isoToScreen(x, y, origin.originX, origin.originY, TILE_WIDTH, TILE_HEIGHT);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.closePath();
    ctx.stroke();
  }

  // selected outline
  if (selectedTile) {
    const { x, y } = selectedTile;
    const { x: sx, y: sy } = isoToScreen(x, y, origin.originX, origin.originY, TILE_WIDTH, TILE_HEIGHT);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.closePath();
    ctx.stroke();
  }
}
