// -----------------------------------------------------------------------------
// encounterTables.js
// Biome/Danger-level weighted pools for mobs, resources, and hazards.
// Also provides helpers to roll archetypes deterministically (you pass in rng).
// No side effects; pure data + tiny utilities.
// -----------------------------------------------------------------------------

/**
 * Danger Level (DL): integer 0..5
 *   0 = trivial, 5 = deadly
 *
 * Biome keys expected:
 *   plains, forest, desert, tropical, tundra, mountains, volcanic_rim, wetlands, coast
 * Extend freely; unknown biomes fall back to "plains".
 */

// -------- Enemy pools (by biome -> DL -> array of archetype ids) ---------------
const ENEMY_POOLS = {
  plains: {
    0: ["field_rat"],
    1: ["wild_dog"],
    2: ["bandit_scout", "wild_dog"],
    3: ["bandit_raider", "wolf"],
    4: ["bandit_raider", "wolf_elder"],
    5: ["war_wolf", "bandit_veteran"]
  },
  forest: {
    0: ["forest_imp"],
    1: ["wolf"],
    2: ["wolf", "bandit_scout"],
    3: ["ash_imp", "wolf_elder"],
    4: ["ash_imp", "bandit_raider"],
    5: ["ash_demon", "war_wolf"]
  },
  desert: {
    0: ["sand_rat"],
    1: ["scavenger"],
    2: ["scorpion", "scavenger"],
    3: ["sand_bandit", "scorpion"],
    4: ["sand_bandit", "scarab_guard"],
    5: ["dune_reaver", "scarab_guard"]
  },
  mountains: {
    0: ["rock_sprite"],
    1: ["cave_grub"],
    2: ["cave_grub", "rock_sprite"],
    3: ["cairn_guard"],
    4: ["cairn_guard", "stone_warg"],
    5: ["stone_warg", "rune_golem"]
  },
  volcanic_rim: {
    0: ["ember_mite"],
    1: ["ash_imp"],
    2: ["ash_imp", "emberling"],
    3: ["emberling", "magma_whelp"],
    4: ["magma_whelp", "ash_stalker"],
    5: ["ash_stalker", "lava_horror"]
  },
  tundra: {
    0: ["ice_mite"],
    1: ["snow_fox"],
    2: ["snow_fox", "raider"],
    3: ["ice_warg", "raider"],
    4: ["ice_warg", "frost_troll"],
    5: ["frost_troll", "blizzard_spirit"]
  },
  wetlands: {
    0: ["bog_mite"],
    1: ["bog_slug"],
    2: ["bog_slug", "bandit_scout"],
    3: ["bog_fiend"],
    4: ["bog_fiend", "mire_witch"],
    5: ["mire_witch", "ancient_mireling"]
  },
  coast: {
    0: ["shore_crab"],
    1: ["reef_eel"],
    2: ["reef_eel", "bandit_scout"],
    3: ["reef_raider"],
    4: ["reef_raider", "tidal_whelp"],
    5: ["tidal_whelp", "storm_siren"]
  },
  tropical: {
    0: ["jungle_rat"],
    1: ["jungle_spider"],
    2: ["jungle_spider", "bandit_scout"],
    3: ["raptorling"],
    4: ["raptorling", "vine_witch"],
    5: ["vine_witch", "ancient_raptor"]
  }
};

// -------- Resource pools (lightweight, expand during content pass) ------------
const RESOURCE_POOLS = {
  plains:    ["herb_common", "ore_copper", "fiber_hemp"],
  forest:    ["herb_moss", "ore_tin", "fiber_flax", "resin_pure"],
  desert:    ["herb_spice", "ore_iron", "glass_shard_fine", "fiber_jute"],
  mountains: ["ore_iron", "ore_coal", "ore_tin", "pelt_thick"],
  volcanic_rim: ["obsidian_chip", "ore_nickel", "herb_ash_bloom"],
  tundra:    ["herb_ice", "pelt_frozen", "ore_tin", "fiber_felt"],
  wetlands:  ["herb_reed", "resin_swamp", "ore_copper"],
  coast:     ["herb_kelp", "pearl_small", "ore_copper"],
  tropical:  ["herb_basil", "resin_sweet", "fiber_jute"]
};

// -------- Hazard pools (non-combat obstacles/environment) ---------------------
const HAZARD_POOLS = {
  plains:    ["snare_trap", "sinkhole_small"],
  forest:    ["thorn_thicket", "snare_trap", "falling_branch"],
  desert:    ["sandstorm_gust", "loose_dune", "cactus_patch"],
  mountains: ["rockslide_small", "icy_patch", "narrow_ledge"],
  volcanic_rim: ["ash_vent", "lava_crust_thin", "toxic_fume"],
  tundra:    ["whiteout_flurry", "thin_ice", "frostbite_zone"],
  wetlands:  ["bog_suction", "toxic_mire", "leeches"],
  coast:     ["rogue_wave", "slippery_rock", "tide_pool_sting"],
  tropical:  ["vines_tangle", "acidic_spores", "quicksand"]
};

// ------------------------------ Utilities ------------------------------------
function clampDL(DL){ return Math.max(0, Math.min(5, DL|0)); }
function tableFor(obj, biome){ return obj[biome] || obj["plains"]; }

export function getMobPool(biome, DL){
  const table = tableFor(ENEMY_POOLS, biome);
  const tier = table[clampDL(DL)] || table[0];
  return Array.isArray(tier) ? tier : [tier];
}

export function getResourcePool(biome){
  return tableFor(RESOURCE_POOLS, biome);
}

export function getHazardPool(biome){
  return tableFor(HAZARD_POOLS, biome);
}

/**
 * Roll N mob archetypes from the biome + DL pool with replacement.
 * @param {object} rng - object with pick(arr) and float() implemented.
 */
export function rollMobArchetypes({ biome, DL, count=1, rng }){
  const pool = getMobPool(biome, DL);
  const out = [];
  for (let i=0; i<count; i++) out.push(rng.pick(pool));
  return out;
}

/**
 * Roll a single resource/hazard id deterministically.
 */
export function rollResource({ biome, rng }){
  return rng.pick(getResourcePool(biome));
}
export function rollHazard({ biome, rng }){
  return rng.pick(getHazardPool(biome));
}
