// /static/src/shards/rdmShardGen.js

import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { regenerateShard } from './shardLoader.js';

/**
 * Generates a random shard with land and water using seeded landmass expansion.
 * @param {object} settings – includes width, height, landPercent (optional)
 * @returns {{ width: number, height: number, tiles: object[][] }}
 */
export function generateRandomShard(settings) {
  const width = settings.worldWidth || 50;
  const height = settings.worldHeight || 50;
  const landPercent = settings.landPercent || 0.35; // 35% land by default

  const totalTiles = width * height;
  const targetLandTiles = Math.floor(totalTiles * landPercent);

  // Initialize all tiles as water
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      biome: 'water',
      explored: false,
      tags: [],
      resources: [],
      encounter: null,
    }))
  );

  // Helper: get valid neighboring coords
  function getNeighbors(x, y) {
    return [
      [x + 1, y], [x - 1, y],
      [x, y + 1], [x, y - 1]
    ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
  }

  // Seed a few random land centers
  const seedCount = 5 + Math.floor(Math.random() * 5); // 5–9 landmasses
  const seeds = [];
  for (let i = 0; i < seedCount; i++) {
    seeds.push([
      Math.floor(Math.random() * width),
      Math.floor(Math.random() * height)
    ]);
  }

  let landPlaced = 0;
  const frontier = [...seeds];

  while (frontier.length > 0 && landPlaced < targetLandTiles) {
    const [x, y] = frontier.shift();
    const tile = tiles[y][x];
    if (tile.biome === 'water') {
      tile.biome = randomLandBiome();
      landPlaced++;
    }

    // Add neighbors with 60% chance to continue expansion
    getNeighbors(x, y).forEach(([nx, ny]) => {
      if (tiles[ny][nx].biome === 'water' && Math.random() < 0.6) {
        frontier.push([nx, ny]);
      }
    });
  }

  return {
    width,
    height,
    tiles
  };
}

/**
 * Chooses a random land biome (you can customize this).
 */
function randomLandBiome() {
  const landBiomes = ['grass', 'forest', 'tundra', 'desert'];
  return landBiomes[Math.floor(Math.random() * landBiomes.length)];
}
