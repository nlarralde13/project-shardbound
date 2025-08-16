// /static/src/rdmShardGen.js
// -----------------------------------------------------------------------------
// Deterministic shard generator used by the editor's "Regenerate" and can be
// used by the game runtime for on-the-fly world creation. Stable API:
//   generateShard(width, height, seed, { preset })
// Returns { id, width, height, tiles } where tiles[y][x] minimally contains:
//   { biome, seed, sliceOptions, biomeTier, ownerFaction, passable, tags[] }
// -----------------------------------------------------------------------------

import { SHARD_WIDTH, SHARD_HEIGHT } from '/static/src/config/mapConfig.js';
import { RNG } from '/static/src/utils/rng.js';
import { biomeRegistry } from '/static/src/data/biomeRegistry.js';

/** Exported just so you can preview/set from UI if you want. */
export const SHARD_PRESETS = {
  default     : ['land/grassland','land/forest','water/ocean','land/mountain'],
  archipelago : ['water/ocean','water/ocean','land/grassland','land/forest'],
  continents  : ['land/grassland','land/forest','land/desert','water/ocean'],
  islands     : ['water/ocean','land/grassland','land/forest']
};

/**
 * Generate a shard.
 * width/height default to global config (64×64), but you can pass custom sizes.
 */
export function generateShard(
  width  = SHARD_WIDTH,
  height = SHARD_HEIGHT,
  seed = 0,
  { preset = 'default' } = {}
) {
  const rng = new RNG(seed >>> 0);
  const bag = SHARD_PRESETS[preset] || SHARD_PRESETS.default;

  // Construct the full 2D grid up-front to avoid undefined accesses.
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      biome: 'land/grassland',
      seed: rng.int(),          // per-tile seed enables deterministic slice gen later
      biomeTier: 0,
      ownerFaction: 'neutral',
      passable: true,
      tags: [],
      sliceOptions: {}
    }))
  );

  // Simple placeholder assignment — replace with elevation/climate/whittaker later.
  const choice = (arr) => arr[Math.floor(rng.float() * arr.length)];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tiles[y][x];
      t.biome = choice(bag);
      const d = biomeRegistry[t.biome]?.sliceDefaults || {};
      t.sliceOptions = { ...d };
    }
  }

  return { id: `gen_${width}x${height}_${seed}_${preset}`, width, height, tiles };
}

/* ---------------------------------------------------------------------------
   Tweak map
   - SHARD_PRESETS: swap for real worldgen bands or noise-driven selection.
   - Per-tile schema: add lightweight fields here as your editor UI grows.
   - Determinism: all slice generation should take (worldSeed, tile.seed,
                  biomeDefaults) + overrides to avoid storing slices.
--------------------------------------------------------------------------- */
