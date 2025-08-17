// Centralized colors for biomes & UI
const biomePalette = {
  ocean: '#2e5fa7',
  tropical: '#2fa866',
  desert: '#c9b458',
  volcano: '#5a3a37',
  grassland: '#6dbf57',
  tundra: '#b9d0d6',
  beach: '#e6d8a2',      // NEW: used for coast overlay lines
};

export function getBiomeColor(biome) {
  return biomePalette[biome] ?? '#666666';
}

export const uiColors = {
  grid: 'rgba(255,255,255,0.15)',
  selection: 'rgba(255,255,255,0.35)',
  hover: 'rgba(255,255,255,0.2)',
  region: 'rgba(0,128,255,0.35)',
  poiTown: '#ffd166',    // NEW: town marker
  poiPort: '#6ee7ff',    // NEW: port marker
};
