// Settlement & POI master registry — adds image paths from /static/assets
// Keeps original exports and helpers; adds imgForSettlement().

const BIOME_ASSETS = "/static/assets/biomes";
const LOGO_ASSETS  = "/static/assets/logos";

// Canonical
export const SETTLEMENT_MASTER = {
  Settlement: { display: 'Settlement', color: '#9AA0A8', css: 'poi settlement', img: `${BIOME_ASSETS}/town.png` },
  Port:       { display: 'Port',       color: '#6EC1FF', css: 'poi port',       img: `${BIOME_ASSETS}/ocean_port.png` },
  Volcano:    { display: 'Volcano',    color: '#A14034', css: 'poi volcano',    img: `${BIOME_ASSETS}/volcano.png` },
  Shardgate:  { display: 'Shardgate',  color: '#F4C15D', css: 'poi shardgate',  img: `${LOGO_ASSETS}/cogsprocket.png` }, // placeholder badge
  Landmark:   { display: 'Landmark',   color: '#C0C6CE', css: 'poi landmark',   img: `${LOGO_ASSETS}/cogsprocket.png` }, // placeholder
};

export const SETTLEMENT_ALIASES = {
  // lower-case aliases → Canonical
  town: 'Settlement', village: 'Settlement', city: 'Settlement', hamlet: 'Settlement',
  harbor: 'Port', dock: 'Port', port: 'Port',
  gate: 'Shardgate', portal: 'Shardgate',
  volcano: 'Volcano',
  landmark: 'Landmark', ruin: 'Landmark', ruins: 'Landmark',
};

// Normalize any input → canonical key
export function canonicalSettlement(name) {
  if (!name) return 'Settlement';
  const s = String(name).trim();
  if (SETTLEMENT_MASTER[s]) return s;
  const lc = s.toLowerCase();
  return SETTLEMENT_ALIASES[lc] || (SETTLEMENT_MASTER[name] ? name : 'Settlement');
}

// Classic shape used around the app (kept for back-compat)
export const SETTLEMENT_TYPES = {
  settlement: { key: 'settlement', label: 'Settlement' },
  port:       { key: 'port',       label: 'Port' },
  volcano:    { key: 'volcano',    label: 'Volcano' },
  shardgate:  { key: 'shardgate',  label: 'Shardgate' },
  landmark:   { key: 'landmark',   label: 'Landmark' },
};

// Helpers the viewer uses
export function poiClassFor(type) {
  const key = canonicalSettlement(type);
  return SETTLEMENT_MASTER[key]?.css || 'poi settlement';
}
export function colorForSettlement(type) {
  const key = canonicalSettlement(type);
  return SETTLEMENT_MASTER[key]?.color || '#9AA0A8';
}
export function imgForSettlement(type) {
  const key = canonicalSettlement(type);
  return SETTLEMENT_MASTER[key]?.img || `${LOGO_ASSETS}/cogsprocket.png`;
}

export const ALL_SETTLEMENT_KEYS = Object.keys(SETTLEMENT_MASTER);
