import { BIOMES } from './biomeRegistry.js';

function weightedPick(weightMap) {
  const entries = Object.entries(weightMap);
  const total = entries.reduce((s,[,w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k,w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[0][0];
}

function rollInRange([min,max]) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function rollRoomEvent(biomeKey) {
  const biome = BIOMES[biomeKey] || BIOMES.Forest;
  const type = weightedPick(biome.eventWeights);

  if (type === 'resource') {
    const node = biome.resources[Math.floor(Math.random() * biome.resources.length)];
    return { type, node, qty: rollInRange(node.qty) };
  }

  if (type === 'hazard') {
    const hz = biome.hazards[Math.floor(Math.random() * biome.hazards.length)];
    return { type, hazard: hz, dmg: rollInRange(hz.dmg) };
  }

  if (type === 'hotspot') {
    // Hotspots are future “enterables” (dungeons, shrines, etc.)
    const tags = {
      Forest: 'Ancient Shrine',
      Plains: 'Standing Stone',
      Coast: 'Sea Cave',
      Desert:'Buried Vault',
      Volcano:'Basalt Vent',
      Tundra: 'Icebound Hollow'
    };
    return { type, hotspot: { id:'site', name: tags[biomeKey] || 'Curious Site' } };
  }

  return { type: 'empty' };
}
