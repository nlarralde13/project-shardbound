// eventTables.js — per-biome weights using canonical biome keys; no aliasing.
const EVENT_WEIGHTS = {
  // Forests
  Forest:   { empty:.45, resource:.35, hazard:.15, hotspot:.05 },
  Taiga:    { empty:.50, resource:.25, hazard:.20, hotspot:.05 },
  Jungle:   { empty:.40, resource:.35, hazard:.20, hotspot:.05 },
  Wetland:  { empty:.45, resource:.35, hazard:.15, hotspot:.05 },

  // Grass / savanna bands
  Plains:    { empty:.50, resource:.30, hazard:.15, hotspot:.05 },
  Savanna:   { empty:.50, resource:.30, hazard:.15, hotspot:.05 },
  Shrubland: { empty:.50, resource:.30, hazard:.15, hotspot:.05 },

  // Relief & cold
  Hills:     { empty:.50, resource:.30, hazard:.15, hotspot:.05 },
  Mountains: { empty:.55, resource:.20, hazard:.20, hotspot:.05 },
  Alpine:    { empty:.60, resource:.15, hazard:.20, hotspot:.05 },
  Glacier:   { empty:.65, resource:.10, hazard:.20, hotspot:.05 },
  Tundra:    { empty:.55, resource:.20, hazard:.20, hotspot:.05 },

  // Water & coast
  Coast:   { empty:.50, resource:.30, hazard:.15, hotspot:.05 },
  Ocean:   { empty:.65, resource:.10, hazard:.20, hotspot:.05 },
  Reef:    { empty:.55, resource:.25, hazard:.15, hotspot:.05 },
  River:   { empty:.50, resource:.30, hazard:.15, hotspot:.05 },
  Lake:    { empty:.50, resource:.30, hazard:.15, hotspot:.05 },

  // Arid
  DesertSand: { empty:.55, resource:.20, hazard:.20, hotspot:.05 },
  DesertRock: { empty:.55, resource:.20, hazard:.20, hotspot:.05 },

  // Hotspots / specials
  Volcano:   { empty:.35, resource:.15, hazard:.40, hotspot:.10 },
  LavaField: { empty:.40, resource:.15, hazard:.35, hotspot:.10 },

  // Interiors (still usable on overworld if you want)
  Urban:   { empty:.50, resource:.25, hazard:.20, hotspot:.05 },
  Cave:    { empty:.45, resource:.25, hazard:.25, hotspot:.05 },
};

const DEFAULT_WEIGHTS = { empty:.60, resource:.25, hazard:.10, hotspot:.05 };

function weightedPick(table) {
  const t = table || DEFAULT_WEIGHTS;
  let total = 0; for (const w of Object.values(t)) total += w;
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(t)) { r -= w; if (r <= 0) return k; }
  return 'empty';
}

export function rollRoomEvent(biome) {
  const weights = EVENT_WEIGHTS[biome] || DEFAULT_WEIGHTS;
  const type = weightedPick(weights);

  if (type === 'resource') {
    return { type:'resource', node:{ id:'wood', name:'Wood' }, qty: (Math.random()<0.4?2:1) };
  }
  if (type === 'hazard') {
    return { type:'hazard', hazard:{ name:'Rough terrain' }, dmg: Math.ceil(Math.random()*3) };
  }
  if (type === 'hotspot') {
    return { type:'hotspot', hotspot:{ name:'Curious landmark' } };
  }
  return { type:'empty' };
}
