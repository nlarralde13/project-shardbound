// biomeRegistry.js — Master biome registry (canonical keys + aliases)
// Everything (generator, viewer, overlays) should use canonical keys from here.

const gradient = (a, b) => `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;

// Canonical biome definitions
export const BIOME_MASTER = {
  Ocean:       { display: 'Ocean',            colors: { mapFill: '#2F7AA2', mapStroke: '#205772', uiTintStart: '#123849', uiTintEnd: '#0B1F2A' }, tags: { temp: 'any', moist: 'wet', elev: 'low',  terrain: 'water' } },
  Coast:       { display: 'Coast / Beach',    colors: { mapFill: '#CFAE74', mapStroke: '#7E6B45', uiTintStart: '#2B3D49', uiTintEnd: '#16232C' }, tags: { temp: 'any', moist: 'var', elev: 'low',  terrain: 'sand' } },
  Reef:        { display: 'Coral Reef',       colors: { mapFill: '#1EA3A8', mapStroke: '#147378', uiTintStart: '#0F4346', uiTintEnd: '#092A2C' }, tags: { temp: 'warm', moist: 'wet', elev: 'low', terrain: 'reef' } },
  River:       { display: 'River',            colors: { mapFill: '#3B90B8', mapStroke: '#2A6680', uiTintStart: '#163A50', uiTintEnd: '#0C1F2C' }, tags: { temp: 'any', moist: 'wet', elev: 'var', terrain: 'water' } },
  Lake:        { display: 'Lake',             colors: { mapFill: '#2D7DA6', mapStroke: '#205B78', uiTintStart: '#13384A', uiTintEnd: '#0A202B' }, tags: { temp: 'any', moist: 'wet', elev: 'low', terrain: 'water' } },
  Wetland:     { display: 'Wetland / Marsh',  colors: { mapFill: '#2E5D4E', mapStroke: '#214338', uiTintStart: '#1C3A30', uiTintEnd: '#0F221C' }, tags: { temp: 'any', moist: 'wet', elev: 'low', terrain: 'swamp' } },

  Plains:      { display: 'Plains',           colors: { mapFill: '#6DA444', mapStroke: '#4C7330', uiTintStart: '#2D3F1F', uiTintEnd: '#182610' }, tags: { temp: 'mild', moist: 'med', elev: 'low', terrain: 'grass' } },
  Savanna:     { display: 'Savanna',          colors: { mapFill: '#C2B33C', mapStroke: '#8B7F2A', uiTintStart: '#3E3A1B', uiTintEnd: '#1E1B10' }, tags: { temp: 'warm', moist: 'low', elev: 'low', terrain: 'grass' } },
  Shrubland:   { display: 'Shrubland',        colors: { mapFill: '#9A8F44', mapStroke: '#6C6430', uiTintStart: '#3B3A1F', uiTintEnd: '#1D1C10' }, tags: { temp: 'mild', moist: 'low', elev: 'low', terrain: 'brush' } },

  Forest:      { display: 'Temperate Forest', colors: { mapFill: '#3C8A63', mapStroke: '#2B6247', uiTintStart: '#1E3A2F', uiTintEnd: '#0F2019' }, tags: { temp: 'mild', moist: 'med', elev: 'low', terrain: 'forest' } },
  Taiga:       { display: 'Taiga',            colors: { mapFill: '#2D6248', mapStroke: '#204537', uiTintStart: '#17392A', uiTintEnd: '#0C2018' }, tags: { temp: 'cold', moist: 'med', elev: 'low', terrain: 'forest' } },
  Jungle:      { display: 'Jungle',           colors: { mapFill: '#1C6B46', mapStroke: '#134C33', uiTintStart: '#0F3C2A', uiTintEnd: '#071F16' }, tags: { temp: 'warm', moist: 'high', elev: 'low', terrain: 'forest' } },

  Hills:       { display: 'Hills',            colors: { mapFill: '#6F8D4D', mapStroke: '#4E6436', uiTintStart: '#2E3A21', uiTintEnd: '#171F11' }, tags: { temp: 'any', moist: 'med', elev: 'mid', terrain: 'hills' } },
  Mountains:   { display: 'Mountains',        colors: { mapFill: '#7D7F8B', mapStroke: '#545660', uiTintStart: '#2D3038', uiTintEnd: '#15171B' }, tags: { temp: 'any', moist: 'low', elev: 'high', terrain: 'rock' } },
  Alpine:      { display: 'Alpine',           colors: { mapFill: '#BFCADD', mapStroke: '#8591A5', uiTintStart: '#3B4657', uiTintEnd: '#1B2027' }, tags: { temp: 'cold', moist: 'low', elev: 'high', terrain: 'rock' } },
  Glacier:     { display: 'Glacier',          colors: { mapFill: '#A7D3E9', mapStroke: '#6FA7BF', uiTintStart: '#274A5C', uiTintEnd: '#132531' }, tags: { temp: 'cold', moist: 'ice', elev: 'high', terrain: 'ice' } },
  Tundra:      { display: 'Tundra',           colors: { mapFill: '#6F8AA8', mapStroke: '#4D6276', uiTintStart: '#273142', uiTintEnd: '#101621' }, tags: { temp: 'cold', moist: 'low', elev: 'low', terrain: 'tundra' } },

  DesertSand:  { display: 'Desert (Sand)',    colors: { mapFill: '#D6B26A', mapStroke: '#9A7C48', uiTintStart: '#513C1A', uiTintEnd: '#2A1F10' }, tags: { temp: 'warm', moist: 'low', elev: 'low', terrain: 'sand' } },
  DesertRock:  { display: 'Desert (Rock)',    colors: { mapFill: '#C27E4A', mapStroke: '#885733', uiTintStart: '#4A2E1A', uiTintEnd: '#23170D' }, tags: { temp: 'warm', moist: 'very_low', elev: 'mid', terrain: 'rock' } },

  Volcano:     { display: 'Volcano',          colors: { mapFill: '#A14034', mapStroke: '#6F2C24', uiTintStart: '#4A2121', uiTintEnd: '#1F0F0F' }, tags: { temp: 'hot', moist: 'low', elev: 'high', terrain: 'volcanic' } },
  LavaField:   { display: 'Lava Field',       colors: { mapFill: '#5B2320', mapStroke: '#3C1716', uiTintStart: '#381819', uiTintEnd: '#1A0E0E' }, tags: { temp: 'hot', moist: 'low', elev: 'mid', terrain: 'volcanic' } },

  Cave:        { display: 'Cave / Underground', colors: { mapFill: '#3A3A44', mapStroke: '#2A2A33', uiTintStart: '#26262E', uiTintEnd: '#141419' }, tags: { temp: 'any', moist: 'var', elev: 'sub', terrain: 'cave' } },
  Urban:       { display: 'Urban',            colors: { mapFill: '#9AA0A8', mapStroke: '#6A7076', uiTintStart: '#2D3238', uiTintEnd: '#171A1D' }, tags: { temp: 'any', moist: 'var', elev: 'low', terrain: 'urban' } },
};

// Aliases → canonical keys (lowercase on the left)
export const ALIASES = {
  ocean:'Ocean', sea:'Ocean', deep_ocean:'Ocean',
  coast:'Coast', beach:'Coast', shore:'Coast',
  reef:'Reef', coral:'Reef', lagoon:'Reef',
  river:'River', stream:'River', brook:'River',
  lake:'Lake', pond:'Lake',
  wetland:'Wetland', marsh:'Wetland', swamp:'Wetland', mangrove:'Wetland',

  grassland:'Plains', prairie:'Plains', steppe:'Plains',
  savanna:'Savanna', savannah:'Savanna',
  shrubland:'Shrubland', scrub:'Shrubland', chaparral:'Shrubland',

  forest:'Forest', woodland:'Forest',
  taiga:'Taiga', boreal:'Taiga',
  jungle:'Jungle', rainforest:'Jungle', tropic_forest:'Jungle',

  hills:'Hills', highland:'Hills',
  mountain:'Mountains', mountains:'Mountains', range:'Mountains',
  alpine:'Alpine', snowline:'Alpine',
  glacier:'Glacier', icecap:'Glacier', ice:'Glacier',
  tundra:'Tundra',

  desert:'DesertSand', desert_sand:'DesertSand', dune:'DesertSand',
  desert_rock:'DesertRock', badlands:'DesertRock', mesa:'DesertRock',

  volcanic:'Volcano', volcano:'Volcano',
  lava:'LavaField', ash_field:'LavaField', basalt_flow:'LavaField',

  cave:'Cave', cavern:'Cave', underground:'Cave',
  city:'Urban', town:'Urban', urban:'Urban',
};

// Normalize any input → canonical key
export function canonicalBiome(name) {
  if (!name) return 'Coast';
  if (BIOME_MASTER[name]) return name;
  const exact = BIOME_MASTER[String(name).trim()];
  if (exact) return String(name).trim();
  const lc = String(name).trim().toLowerCase();
  return ALIASES[lc] || 'Coast';
}

// Simple map of fill colors (back-compat)
export const BIOME_COLORS = Object.fromEntries(
  Object.entries(BIOME_MASTER).map(([k, v]) => [k, v.colors.mapFill])
);

// Back-compat "BIOMES" object used by the viewer (tint + optional art)
export const BIOMES = Object.fromEntries(
  Object.entries(BIOME_MASTER).map(([k, v]) => [
    k,
    { tint: gradient(v.colors.uiTintStart, v.colors.uiTintEnd), art: null }
  ])
);

// Flavor titles per biome (truncate or expand later)
const TITLE_BANK = {
  Coast: ['Salt-stung Strand', 'Driftwood Bay', 'Whispering Dunes'],
  Ocean: ['Slatewater Expanse', 'The Green Current'],
  Reef: ['Shifting Coral Garden', 'Lagoon of Glass'],
  River: ['Oxbow Bend', 'Silver Run'],
  Lake: ['Mirrorlake', 'Stillwater Reach'],
  Wetland: ['Fen of Lanterns', 'Murkroot Bog'],

  Plains: ['Widebarrow Steppe', 'Lark Meadow', 'Open Veldt'],
  Savanna: ['Acacia Flats', 'Lion’s Walk'],
  Shrubland: ['Stonebroom Scrub', 'Thornwake'],

  Forest: ['Shadowed Grove', 'Mosslight Vale', 'Whisperholt'],
  Taiga: ['Pineweald', 'Frostbough'],
  Jungle: ['Emerald Tangle', 'Vinebound Hollows'],

  Hills: ['Rolling Rise', 'Sheeprock Downs'],
  Mountains: ['Grayspire Ridge', 'Anvil Range'],
  Alpine: ['Snowglass Shelf', 'Skyline Tors'],
  Glacier: ['Blueheart Ice', 'Creaking Field'],
  Tundra: ['Silent Flats', 'Pale Steppe'],

  DesertSand: ['Shifting Sea', 'Sunwound Basin'],
  DesertRock: ['Broken Tablelands', 'Red Mesa'],

  Volcano: ['Cinder Crown', 'Ashen Maw'],
  LavaField: ['Scoria Waste', 'Basalt Flats'],

  Cave: ['Hollow of Echoes', 'Gloam Vault'],
  Urban: ['Outer Ward', 'Old Market'],

  _default: ['Unmarked Ground', 'Lone Crossing'],
};

export function randomTitleFor(biome) {
  const key = canonicalBiome(biome);
  const arr = TITLE_BANK[key] || TITLE_BANK._default;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Useful in editors/tools
export const ALL_BIOME_KEYS = Object.keys(BIOME_MASTER);
