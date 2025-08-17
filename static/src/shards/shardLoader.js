// Loads shard JSON seeds (A/E) or builds an ocean fallback.
import { SHARD_COLS, SHARD_ROWS } from '../config/mapConfig.js';

export async function loadShard(id = 'A') {
  const map = { A: 'shardA.json', E: 'shardE.json' }[id] ?? 'shardA.json';
  const url = `/static/src/data/shards/${map}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return normalizeShard(data);
  } catch (e) {
    console.warn(`loadShard(${id}) fallback to ocean:`, e);
    return oceanFallback(id);
  }
}

function normalizeShard(data) {
  // Expect: { shardId, worldSeed, tiles: [{x,y,biome}, ...] } OR tiles[y][x]
  if (Array.isArray(data.tiles) && Array.isArray(data.tiles[0])) {
    // Already 2D
    return data;
  }
  // Convert flat list to 2D grid
  const grid = Array.from({ length: SHARD_ROWS }, () => Array.from({ length: SHARD_COLS }, () => ({ biome: 'ocean' })));
  for (const t of data.tiles) {
    if (t.x >= 0 && t.x < SHARD_COLS && t.y >= 0 && t.y < SHARD_ROWS) {
      grid[t.y][t.x] = { biome: t.biome ?? 'ocean' };
    }
  }
  return { shardId: data.shardId, worldSeed: data.worldSeed, tiles: grid };
}

function oceanFallback(shardId) {
  const tiles = Array.from({ length: SHARD_ROWS }, (_, y) =>
    Array.from({ length: SHARD_COLS }, (_, x) => ({ biome: 'ocean', x, y })));
  return { shardId, worldSeed: `FALLBACK_${shardId}`, tiles };
}
