// Loot tiers & rolls for ambush and slice. Biome-aware item maps kept small; extend later.

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
  // All T0 + T1 across biomes (subset; add more as you expand)
  "scrap_bone","torn_pelt","broken_fang","twig_bundle","bug_chitin","sand_shard","dried_scale",
  "cracked_claw","shale_chunk","dented_plate","dusty_pelt","ash_flake","scorched_fiber","charred_bone",
  "frost_scrap","brittle_bone","frayed_fur","mire_mud","reedy_twine","bog_chitin","shell_chipped",
  "tangle_kelp","salt_spray","dried_leaf","bug_carapace",
  "herb_common","ore_copper","fiber_hemp","herb_moss","ore_tin","fiber_flax","herb_spice","fiber_jute",
  "ore_iron","ore_coal","fiber_wool","obsidian_chip","ore_nickel","herb_ash_bloom","herb_ice","herb_reed",
  "herb_kelp","herb_basil"
]);

// Ambush tier weights by DL (table 4.2)
const AMB_TIER_WEIGHTS = {
  0: { T0:55, T1:40, T2:5,  T3:0, T4:0 },
  1: { T0:45, T1:45, T2:9,  T3:1, T4:0 },
  2: { T0:35, T1:50, T2:13, T3:2, T4:0 },
  3: { T0:25, T1:55, T2:17, T3:3, T4:0 },
  4: { T0:20, T1:55, T2:20, T3:5, T4:0 },
  5: { T0:15, T1:55, T2:22, T3:7, T4:1 }
};
// Slice tier weights by room DL (table 4.3)
const SLICE_TIER_WEIGHTS = {
  0: { T0:40, T1:45, T2:13, T3:2,  T4:0 },
  1: { T0:30, T1:50, T2:17, T3:3,  T4:0 },
  2: { T0:20, T1:55, T2:20, T3:5,  T4:0 },
  3: { T0:15, T1:55, T2:23, T3:6,  T4:1 },
  4: { T0:10, T1:55, T2:25, T3:9,  T4:1 },
  5: { T0:8,  T1:52, T2:27, T3:11, T4:2 },
};

function weightedPick(weights, rngFloat){
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [,w]) => a + w, 0);
  let r = rngFloat()*total;
  for (const [tier, w] of entries){ if ((r -= w) <= 0) return tier; }
  return entries[entries.length-1][0];
}

export function rollAmbushLoot(DL, biome, rng){
  const tier = weightedPick(AMB_TIER_WEIGHTS[Math.max(0,Math.min(5,DL))], rng.float());
  const pool = (biomeItems[biome] || biomeItems["plains"])[tier];
  return rng.pick(pool);
}
export function rollSliceLoot(roomDL, biome, rng){
  const tier = weightedPick(SLICE_TIER_WEIGHTS[Math.max(0,Math.min(5,roomDL))], rng.float());
  const pool = (biomeItems[biome] || biomeItems["plains"])[tier];
  return rng.pick(pool);
}
export function rollSliceChestBonus(roomDL, biome, rng){
  return rollSliceLoot(roomDL, biome, rng);
}
