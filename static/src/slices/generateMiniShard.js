// Generate a deterministic 4×4 mini-shard (rooms) based on shard/tile + worldSeed.
import { seededRNG } from '../utils/rng.js';
import { getEncounterTables } from '../data/encounterTables.js';
import { getRoomState, setRoomState } from '../state/roomState.js';

export function generateMiniShard({ shardId, tileX, tileY, biome, worldSeed }) {
  const seed = `${worldSeed}|${shardId}|${tileX},${tileY}|rooms4x4`;
  const rng = seededRNG(seed);
  const R = 4;
  const tables = getEncounterTables(biome);

  const rooms = [];
  for (let ry = 0; ry < R; ry++) {
    const row = [];
    for (let rx = 0; rx < R; rx++) {
      const rseed = `${seed}|${rx},${ry}`;
      const rr = seededRNG(rseed);

      const mobs = rollWeighted(rr, tables.mobs, rr.int(0, 1));        // 0–1 mobs
      const resources = rollWeighted(rr, tables.resources, rr.int(0, 2)); // 0–2 nodes
      const hazards = rollWeighted(rr, tables.hazards, rr.int(0, 1));  // 0–1 hazards

      const state = getRoomState({ shardId, tileX, tileY, roomX: rx, roomY: ry }) || { cleared: false, harvested: [] };

      row.push({
        x: rx, y: ry,
        mobs, resources, hazards,
        interactables: [], // reserved
        state,
      });
    }
    rooms.push(row);
  }

  return { rooms, seedUsed: seed, biome };
}

// Utility: pick N items by weight (no replacement)
function rollWeighted(rng, table, count) {
  if (count <= 0) return [];
  const picks = [];
  for (let i = 0; i < count; i++) {
    picks.push(rng.pickWeighted(table));
  }
  return picks.map(id => ({ id }));
}

// Example resolvers you might call after combat/harvest:
export function markRoomCleared({ shardId, tileX, tileY, roomX, roomY }) {
  const state = getRoomState({ shardId, tileX, tileY, roomX, roomY }) || {};
  state.cleared = true;
  setRoomState({ shardId, tileX, tileY, roomX, roomY }, state);
}
