// renderShard.js
// Draws the full isometric shard onto the canvas using externally provided sizing and origin

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';

/**
 * renderShard
 * Renders an isometric grid of tiles and optional highlight, using provided origin values.
 * Canvas sizing must be done once in main2.js before calling this function.
 *
 * @param {CanvasRenderingContext2D} ctx       - the 2D context of the <canvas>
 * @param {Object} shardData                   - { width, height, tiles[y][x] }
 * @param {Object|null} selectedTile           - { x, y } to outline, or null for none
 * @param {number} originX                     - x-offset for centering grid
 * @param {number} originY                     - y-offset for centering grid
 */
export function renderShard(ctx, shardData, selectedTile = null, originX, originY, showGrid = false) {
  

  if (!shardData || !shardData.tiles) return;
    
  const canvas = ctx.canvas;
  console.log('canvas = ', canvas)
  const cols = shardData.width;
  const rows = shardData.height;

  // 1) Reset transforms and clear entire canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2) Define color mapping for biomes
  const biomeColors = {
    grass: '#4CAF50',
    forest: '#7d372eff',
    water: '#2196F3',
    mountain: '#9E9E9E'
  };

  // 3) Draw every tile in isometric projection
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      
      const tile = shardData.tiles[y][x];
      const screenX = originX + (x - y) * (TILE_WIDTH /2 );
      const screenY = originY + (x + y) * (TILE_HEIGHT / 2);

      if (x===0 && y===0) {console.log('TILE[0,0] at', screenX, screenY);
      }
      
      

      // 3a) Shadow under tile
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY + TILE_HEIGHT / 2);
      ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT * 1.5);
      ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // 3b) Tile surface
      ctx.fillStyle = biomeColors[tile.biome] || '#555';
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
      ctx.lineTo(screenX, screenY + TILE_HEIGHT);
      ctx.lineTo(screenX - TILE_WIDTH / 2, screenY + TILE_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();
      
      if (showGrid) {
        console.log("show grid pressed")
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + TILE_WIDTH/2, screenY + TILE_HEIGHT/2);
        ctx.lineTo(screenX, screenY + TILE_HEIGHT);
        ctx.lineTo(screenX - TILE_WIDTH/2, screenY + TILE_HEIGHT/2);
        ctx.closePath();
        ctx.stroke();
        }
      }
    }

  //toggle grid overlay when drawing tiles - dev tool  
  

  // 4) Highlight selected tile if provided
  if (selectedTile) {
    const { x, y } = selectedTile;
    const sx = originX + (x - y) * (TILE_WIDTH / 2);
    const sy = originY + (x + y) * (TILE_HEIGHT / 2);
    console.log(`HIGHLIGHT at sx=${sx}, sy=${sy}`);


    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.closePath();
    ctx.stroke();
  }
}
