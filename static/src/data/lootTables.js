// /static/src/data/lootTables.js
// Loot tiers & rolls for ambush and slice. Biome-aware item maps kept small; extend later.
import { rngFrom } from "../utils/rng.js";

export const TIERS = { T0:"T0", T1:"T1", T2:"T2", T3:"T3", T4:"T4" };

// Per-biome item pools by tier (non-rare set marks T0/T1 as safe-to-lose on defeat)
const biomeItems = {
  plains: {
    T0: ["scrap_bone","torn_pelt","broken_fang"],
    T1: ["herb_common","ore_copper","fiber_hemp"],
    T2: ["ingot_bronze","pelt_cured","mana_shard_small"],
    T3: ["rare_mat_plains","blueprint_frag_1"],
    T4: ["epic_core_fragment"]
  },
  forest: {
    T0: ["twig_bundle","bug_chitin","torn_pelt"],
    T1: ["herb_moss","ore_tin","fiber_flax"],
    T2: ["ingot_bronze","resin_pure","mana_shard_small"],
    T3: ["rare_mooncap","blueprint_frag_1"],
    T4: ["ancient_heartwood"]
  },
  desert: {
    T0: ["sand_shard","dried_scale","cracked_claw"],
    T1: ["herb_spice","ore_iron","fiber_jute"],
    T2: ["ingot_iron","glass_shard_fine","mana_shard_small"],
    T3: ["rare_meteor_fragment","blueprint_frag_2"],
    T4: ["sun_crystal"]
  },
  mountains: {
    T0: ["shale_chunk","dented_plate","dusty_pelt"],
    T1: ["ore_iron","ore_coal","fiber_wool"],
    T2: ["ingot_steel","mana_shard_small","pelt_thick"],
    T3: ["rare_runic_dust","blueprint_frag_2"],
    T4: ["ancient_core_runic"]
  },
  volcanic_rim: {
    T0: ["ash_flake","scorched_fiber","charred_bone"],
    T1: ["obsidian_chip","ore_nickel","herb_ash_bloom"],
    T2: ["ingot_nickel","mana_shard_small","obsidian_piece"],
    T3: ["rare_obsidian_core","blueprint_frag_3"],
    T4: ["magma_heart"]
  },
  tundra: {
    T0: ["frost_scrap","brittle_bone","frayed_fur"],
    T1: ["herb_ice","ore_tin","fiber_felt"],
    T2: ["ingot_bronze","mana_shard_small","pelt_frozen"],
    T3: ["rare_frost_crystal","blueprint_frag_2"],
    T4: ["heart_of_winter"]
  },
  wetlands: {
    T0: ["mire_mud","reedy_twine","bog_chitin"],
    T1: ["herb_reed","ore_copper","fiber_flax"],
    T2: ["ingot_bronze","mana_shard_small","resin_swamp"],
    T3: ["rare_mire_amber","blueprint_frag_1"],
    T4: ["ancient_bog_core"]
  },
  coast: {
    T0: ["shell_chipped","tangle_kelp","salt_spray"],
    T1: ["herb_kelp","ore_copper","fiber_hemp"],
    T2: ["ingot_bronze","mana_shard_small","pearl_small"],
    T3: ["rare_black_pearl","blueprint_frag_1"],
    T4: ["storm_pearl"]
  },
  tropical: {
    T0: ["dried_leaf","bug_carapace","torn_pelt"],
    T1: ["herb_basil","ore_copper","fiber_jute"],
    T2: ["ingot_bronze","mana_shard_small","resin_sweet"],
    T3: ["rare_sun_bloom","blueprint_frag_3"],
    T4: ["ancient_sun_core"]
  },
};

export const NON_RARE_SET = new Set([
  // Common loss-safe items across biomes (subset)
  "scrap_bone","torn_pelt","broken_fang","twig_bundle","bug_chitin","sand_shard","dried_scale",
  "cracked_claw","shale_chunk","dented_plate","dusty_pelt","ash_flake","scorched_fiber","charred_bone",
  "frost_scrap","brittle_bone","frayed_fur","mire_mud","reedy_twine","bog_chitin","shell_chipped",
  "tangle_kelp","salt_spray","dried_leaf","bug_carapace",
  "herb_common","ore_copper","fiber_hemp","herb_moss","ore_tin","fiber_flax","herb_spice","fiber_jute",
  "ore_iron","ore_coal","fiber_wool","obsidian_chip","ore_nickel","herb_ash_bloom","herb_ice","herb_reed",
  "herb_kelp","herb_basil"
]);

// Ambush tier weights by DL
const AMB_TIER_WEIGHTS = {
  0: { T0:55, T1:40, T2:5,  T3:0, T4:0 },
  1: { T0:45, T1:45, T2:9,  T3:1, T4:0 },
  2: { T0:35, T1:50, T2:13, T3:2, T4:0 },
  3: { T0:25, T1:55, T2:17, T3:3, T4:0 },
  4: { T0:20, T1:55, T2:20, T3:5,  T4:0 },
  5: { T0:15, T1:55, T2:22, T3:7,  T4:1 }
};
// Slice tier weights by room DL
const SLICE_TIER_WEIGHTS = {
  0: { T0:40, T1:45, T2:13, T3:2,  T4:0 },
  1: { T0:30, T1:50, T2:17, T3:3,  T4:0 },
  2: { T0:20, T1:55, T2:20, T3:5,  T4:0 },
  3: { T0:15, T1:55, T2:23, T3:6,  T4:1 },
  4: { T0:10, T1:55, T2:25, T3:9,  T4:1 },
  5: { T0:8,  T1:52, T2:27, T3:11, T4:2 },
};

// ---------------- Helpers ----------------
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function weightsObjToArray(obj){
  // => [['T0', 0.55], ['T1', 0.40], ...] normalized 0..1
  const entries = Object.entries(obj).map(([k,v]) => [k, Number(v)]);
  const sum = entries.reduce((s, [,w]) => s + w, 0) || 1;
  return entries.map(([k,w]) => [k, w / sum]);
}

export function weightedPick(weightsArray, randf){
  // weightsArray must be [['key', weightNormalized], ...]
  const r = randf(); // 0..1
  let acc = 0;
  for (const [key, w] of weightsArray) {
    acc += w;
    if (r <= acc) return key;
  }
  return weightsArray[weightsArray.length - 1][0];
}

function poolFor(biome){
  return biomeItems[biome] || biomeItems.plains;
}
function pickItemFromTier(tier, biome, randf){
  const pool = poolFor(biome)[tier] || poolFor("plains")[tier];
  const items = Array.isArray(pool) ? pool : [];
  if (!items.length) return null;
  const idx = Math.floor(randf() * items.length);
  return items[Math.min(idx, items.length - 1)];
}
function getSliceTierTable(biome, roomDL){
  const obj = SLICE_TIER_WEIGHTS[clamp(roomDL|0, 0, 5)] || SLICE_TIER_WEIGHTS[0];
  return weightsObjToArray(obj);
}

// ---------------- Ambush / Slice rolls ----------------
export function rollAmbushLoot(DL, biome, rng){
  const weights = weightsObjToArray(AMB_TIER_WEIGHTS[clamp(DL|0,0,5)]);
  const tier = weightedPick(weights, () => rng.float());
  return rng.pick(poolFor(biome)[tier]);
}

/**
 * rollSliceLoot
 * ctx = {
 *   worldSeed, shardId, tileX, tileY, roomX, roomY, playerId,
 *   biome, dangerLevel, forNode?: boolean
 * }
 */
export function rollSliceLoot(ctx){
  const rng = rngFrom({ ...ctx, systemTag: "LOOT" });
  const randf = () => rng.float();

  const tierWeights = getSliceTierTable(ctx.biome, ctx.dangerLevel);
  let tier = weightedPick(tierWeights, randf);

  // Resource nodes shouldn't return junk
  if (ctx.forNode && tier === TIERS.T0) tier = TIERS.T1;

  return pickItemFromTier(tier, ctx.biome, randf);
}

// Optional: bonus chest roll helper (same ctx with maybe higher DL if you want)
export function rollSliceChestBonus(ctx){
  return rollSliceLoot(ctx);
}

export { biomeItems };
