// Biome registry: art, tint, resources, hazards, and event weights.
export const BIOMES = {
  Forest: {
    key: 'Forest',
    titlePool: ['Shadowed Grove','Whisperwood','Elder Copse'],
    art: '/static/assets/biomes/dark_forest.png',
    tint: 'linear-gradient(135deg,#1e3a2f,#0f2019)',
    resources: [
      { id:'herb_mooncap', name:'Mooncap Herb', qty:[1,3] },
      { id:'wood_oak',     name:'Oak Wood',     qty:[1,2] }
    ],
    hazards: [
      { id:'thorns', name:'Hookthorn Bramble', dmg:[1,3] },
      { id:'wasps',  name:'Irritable Wasps',   dmg:[1,2] }
    ],
    eventWeights: { empty: 55, resource: 28, hazard: 12, hotspot: 5 }
  },

  Plains: {
    key: 'Plains',
    titlePool: ['Windworn Steppe','Open Heath','Greenreach'],
    art: '/static/assets/biomes/plains.png',
    tint: 'linear-gradient(135deg,#2d3f1f,#182610)',
    resources: [
      { id:'fiber_flax', name:'Flax Fiber', qty:[1,3] },
      { id:'grain_barley', name:'Barley', qty:[1,4] }
    ],
    hazards: [
      { id:'boar', name:'Territorial Boar', dmg:[2,4] }
    ],
    eventWeights: { empty: 58, resource: 28, hazard: 9, hotspot: 5 }
  },

  Coast: {
    key: 'Coast',
    titlePool: ['Salt-Swept Strand','Gull Point','Shale Cove'],
    art: '/static/assets/biomes/ocean_port.png',
    tint: 'linear-gradient(135deg,#123849,#0b1f2a)',
    resources: [
      { id:'salt', name:'Sea Salt', qty:[1,2] },
      { id:'kelp', name:'Kelp',     qty:[1,3] }
    ],
    hazards: [
      { id:'crab', name:'Snapping Crabs', dmg:[1,3] },
      { id:'squall', name:'Sudden Squall', dmg:[1,2] }
    ],
    eventWeights: { empty: 54, resource: 30, hazard: 11, hotspot: 5 }
  },

  Desert: {
    key: 'Desert',
    titlePool: ['Sun-Bleached Dune','Glass Flats','Scorpion Rise'],
    art: '/static/assets/biomes/desert.png',
    tint: 'linear-gradient(135deg,#513c1a,#2a1f10)',
    resources: [
      { id:'spice_cumin', name:'Cumin Pods', qty:[1,3] },
      { id:'ore_copper',  name:'Surface Copper', qty:[1,2] }
    ],
    hazards: [
      { id:'heat', name:'Heat Exhaustion', dmg:[1,3] },
      { id:'adder', name:'Sand Adder', dmg:[2,4] }
    ],
    eventWeights: { empty: 50, resource: 24, hazard: 21, hotspot: 5 }
  },

  Volcano: {
    key: 'Volcano',
    titlePool: ['Cindered Rim','Basalt Shelf','Ashen March'],
    art: '/static/assets/biomes/volcano.png',
    tint: 'linear-gradient(135deg,#4a2121,#1f0f0f)',
    resources: [
      { id:'ore_obsidian', name:'Obsidian Shard', qty:[1,2] },
      { id:'ore_iron', name:'Iron Nodule', qty:[1,2] }
    ],
    hazards: [
      { id:'gas', name:'Sulfurous Fume', dmg:[2,4] },
      { id:'ember', name:'Falling Embers', dmg:[1,3] }
    ],
    eventWeights: { empty: 45, resource: 22, hazard: 28, hotspot: 5 }
  },

  Tundra: {
    key: 'Tundra',
    titlePool: ['Frostplain','Pale Steppe','Silent Drift'],
    art: '/static/assets/biomes/tundra.png',
    tint: 'linear-gradient(135deg,#273142,#101621)',
    resources: [
      { id:'lichen', name:'Frost Lichen', qty:[1,2] },
      { id:'ice_shard', name:'Blue Ice', qty:[1,2] }
    ],
    hazards: [
      { id:'cold', name:'Biting Cold', dmg:[1,3] },
      { id:'wolf', name:'Grey Wolf Pack', dmg:[2,5] }
    ],
    eventWeights: { empty: 52, resource: 26, hazard: 17, hotspot: 5 }
  }
};

// Helper to pick a random title per biome
export function randomTitleFor(biome) {
  const pool = BIOMES[biome]?.titlePool || [biome];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Color swatches for POIs/settlements and map UI
export const BIOME_COLORS = {
  Forest:  '#3c8a63',
  Plains:  '#6da444',
  Coast:   '#2f7aa2',
  Desert:  '#b28b4a',
  Volcano: '#9a3e32',
  Tundra:  '#6f8aa8'
};
