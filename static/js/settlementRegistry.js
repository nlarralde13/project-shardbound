// Settlement & POI master registry — canonical keys, colors, aliases, helpers.
// Canonical keys we use in saved shards and the UI: Settlement, Port, Volcano, Shardgate, Landmark
// (Add more later without breaking consumers.)

export const SETTLEMENT_MASTER = {
  Settlement: { display: 'Settlement', color: '#9AA0A8', css: 'poi settlement' },
  Port:       { display: 'Port',       color: '#6EC1FF', css: 'poi port' },
  Volcano:    { display: 'Volcano',    color: '#A14034', css: 'poi volcano' },
  Shardgate:  { display: 'Shardgate',  color: '#F4C15D', css: 'poi shardgate' },
  Landmark:   { display: 'Landmark',   color: '#C0C6CE', css: 'poi landmark' },
};

export const SETTLEMENT_ALIASES = {
  // lower-case aliases → Canonical
  town: 'Settlement', village: 'Settlement', city: 'Settlement', hamlet: 'Settlement',
  harbor: 'Port', dock: 'Port',
  gate: 'Shardgate', portal: 'Shardgate',
  volcano: 'Volcano',
  landmark: 'Landmark', ruin: 'Landmark', ruins: 'Landmark',
};

// Normalize any input → canonical settlement key
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
export const ALL_SETTLEMENT_KEYS = Object.keys(SETTLEMENT_MASTER);
