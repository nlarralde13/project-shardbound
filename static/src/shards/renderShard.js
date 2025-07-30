import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';

let lastHovered = { x: -1, y: -1 }; // Cache to avoid redraw spam

/**
 * Renders an isometric shard of tiles onto the canvas context.
 * If a hoveredTile is provided, it draws a golden highlight outline.
 */
export function renderShard(ctx, shardData, hoveredTile = null) {
  if (!shardData || !shardData.tiles) return;

  // Avoid re-rendering if hovered tile hasn't changed
  if (
    hoveredTile &&
    lastHovered.x === hoveredTile.x &&
    lastHovered.y === hoveredTile.y
  ) {
    return; // skip redundant draw
  }

  lastHovered = hoveredTile ? { x: hoveredTile.x, y: hoveredTile.y } : { x: -1, y: -1 };

  console.log("[renderShard] 🖼️ Rendering", shardData.width + "×" + shardData.height);

  const biomeColors = {
    grass: "#4CAF50",
    forest: "#2E7D32",
    water: "#2196F3",
    mountain: "#9E9E9E"
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset zoom transform
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const originX = ctx.canvas.width / 2;
  const originY = 40;

  for (let y = 0; y < shardData.height; y++) {
    for (let x = 0; x < shardData.width; x++) {
      const tile = shardData.tiles[y][x];
      const biome = tile.biome || "grass";
      const screenX = originX + (x - y) * (TILE_WIDTH / 2);
      const screenY = originY + (x + y) * (TILE_HEIGHT / 2);

      // Shadow layer
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + TILE_HEIGHT / 2);
      ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT * 1.5);
      ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Tile fill
      ctx.fillStyle = biomeColors[biome] || "#555";
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw hover tile highlight
  if (hoveredTile) {
    const { x, y } = hoveredTile;
    const screenX = originX + (x - y) * (TILE_WIDTH / 2);
    const screenY = originY + (x + y) * (TILE_HEIGHT / 2);

    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
    ctx.lineTo(screenX, screenY + TILE_HEIGHT);
    ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
    ctx.closePath();
    ctx.stroke();
  }
}
