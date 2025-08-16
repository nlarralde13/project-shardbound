// /static/src/data/biomeRegistry.js
// Plain ES module (no TypeScript). Exports defaults used by the editor & generators.

export const biomeRegistry = {
  'land/grassland': {
    sliceDefaults: {
      mob_density: 0.06,
      dungeon_chance: 0.01,
      can_spawn_elite: true,
      elite_rate: 0.05,
      rare_mob_rate: 0.01,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0,
      resources: ['berries', 'fiber', 'clay'],
      subtype: 'temperate'
    }
  },
  'land/forest': {
    sliceDefaults: {
      mob_density: 0.08,
      dungeon_chance: 0.02,
      can_spawn_elite: true,
      elite_rate: 0.07,
      rare_mob_rate: 0.012,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0,
      resources: ['wood', 'herbs', 'mushroom', 'resin'],
      subtype: 'old_growth'
    }
  },
  'land/desert': {
    sliceDefaults: {
      mob_density: 0.04,
      dungeon_chance: 0.012,
      can_spawn_elite: true,
      elite_rate: 0.05,
      rare_mob_rate: 0.008,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: true,
      coral_present: false,
      pearl_rate: 0,
      resources: ['sand', 'oil', 'glasswort'],
      subtype: 'dune'
    }
  },
  'land/tundra': {
    sliceDefaults: {
      mob_density: 0.03,
      dungeon_chance: 0.008,
      can_spawn_elite: true,
      elite_rate: 0.04,
      rare_mob_rate: 0.008,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0,
      resources: ['ice', 'pelts'],
      subtype: 'boreal'
    }
  },
  'land/mountain': {
    sliceDefaults: {
      mob_density: 0.05,
      dungeon_chance: 0.015,
      can_spawn_elite: true,
      elite_rate: 0.06,
      rare_mob_rate: 0.01,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0,
      resources: ['stone', 'ore', 'silver'],
      subtype: 'alpine'
    }
  },
  'land/swamp': {
    sliceDefaults: {
      mob_density: 0.07,
      dungeon_chance: 0.02,
      can_spawn_elite: true,
      elite_rate: 0.05,
      rare_mob_rate: 0.012,
      can_spawn_fish: true,
      fish_density: 0.15,
      boat_allowed: true,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0,
      resources: ['peat', 'reeds', 'herbs'],
      subtype: 'bog'
    }
  },
  'land/badlands': {
    sliceDefaults: {
      mob_density: 0.06,
      dungeon_chance: 0.02,
      can_spawn_elite: true,
      elite_rate: 0.08,
      rare_mob_rate: 0.015,
      can_spawn_fish: false,
      fish_density: 0,
      boat_allowed: false,
      oil_seeps: true,
      coral_present: false,
      pearl_rate: 0,
      resources: ['clay', 'hematite', 'fossil'],
      subtype: 'mesas'
    }
  },
  'water/ocean': {
    sliceDefaults: {
      mob_density: 0.02,
      dungeon_chance: 0.002,
      can_spawn_elite: false,
      elite_rate: 0,
      rare_mob_rate: 0.01,
      can_spawn_fish: true,
      fish_density: 0.35,
      boat_allowed: true,
      oil_seeps: true,
      coral_present: false,
      pearl_rate: 0.02,
      resources: ['kelp', 'seawater', 'salt', 'oil'],
      subtype: 'shelf'
    }
  },
  'water/lake': {
    sliceDefaults: {
      mob_density: 0.02,
      dungeon_chance: 0.004,
      can_spawn_elite: false,
      elite_rate: 0,
      rare_mob_rate: 0.008,
      can_spawn_fish: true,
      fish_density: 0.28,
      boat_allowed: true,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0.01,
      resources: ['freshwater', 'fish', 'reeds'],
      subtype: 'freshwater'
    }
  },
  'water/river': {
    sliceDefaults: {
      mob_density: 0.02,
      dungeon_chance: 0.004,
      can_spawn_elite: false,
      elite_rate: 0,
      rare_mob_rate: 0.008,
      can_spawn_fish: true,
      fish_density: 0.25,
      boat_allowed: true,
      oil_seeps: false,
      coral_present: false,
      pearl_rate: 0.005,
      resources: ['freshwater', 'fish', 'clay'],
      subtype: 'delta'
    }
  },
  'water/reef': {
    sliceDefaults: {
      mob_density: 0.03,
      dungeon_chance: 0.004,
      can_spawn_elite: true,
      elite_rate: 0.05,
      rare_mob_rate: 0.015,
      can_spawn_fish: true,
      fish_density: 0.40,
      boat_allowed: true,
      oil_seeps: false,
      coral_present: true,
      pearl_rate: 0.03,
      resources: ['coral', 'kelp', 'pearl', 'seawater'],
      subtype: 'coral_reef'
    }
  }
};

// Optional helpers
export const BIOME_IDS = Object.keys(biomeRegistry);

export function biomeDefaults(biomeId) {
  return biomeRegistry[biomeId]?.sliceDefaults
      ?? biomeRegistry['land/grassland'].sliceDefaults;
}
