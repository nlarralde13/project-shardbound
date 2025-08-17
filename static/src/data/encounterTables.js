// Minimal biome-weighted tables for MVP1
const TABLES = {
  ocean: {
    mobs:      [{ id: 'sea_slime', weight: 3 }, { id: 'pirate_scout', weight: 1 }],
    resources: [{ id: 'kelp', weight: 4 }, { id: 'shells', weight: 3 }],
    hazards:   [{ id: 'rip_current', weight: 2 }, { id: 'jellyfish', weight: 1 }],
  },
  tropical: {
    mobs:      [{ id: 'wild_boar', weight: 3 }, { id: 'jungle_bandit', weight: 2 }],
    resources: [{ id: 'herbs', weight: 4 }, { id: 'hardwood', weight: 3 }, { id: 'fruit', weight: 2 }],
    hazards:   [{ id: 'quicksand', weight: 1 }, { id: 'poison_ivy', weight: 2 }],
  },
  desert: {
    mobs:      [{ id: 'sand_imp', weight: 3 }, { id: 'bandit', weight: 2 }],
    resources: [{ id: 'ore', weight: 2 }, { id: 'cactus', weight: 3 }],
    hazards:   [{ id: 'sandstorm', weight: 2 }, { id: 'sinkhole', weight: 1 }],
  },
  volcano: {
    mobs:      [{ id: 'ash_imp', weight: 4 }, { id: 'lava_sprite', weight: 2 }],
    resources: [{ id: 'obsidian', weight: 3 }, { id: 'sulfur', weight: 2 }],
    hazards:   [{ id: 'lava_vent', weight: 3 }, { id: 'toxic_fumes', weight: 2 }],
  },
};

export function getEncounterTables(biome) {
  return TABLES[biome] ?? TABLES['ocean'];
}
