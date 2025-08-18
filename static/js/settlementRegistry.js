// Settlement & POI registry — light metadata + helpers.
// Types: settlement, port, volcano (hotspot).
export const SETTLEMENT_TYPES = {
  settlement: { key: 'settlement', label: 'Settlement' },
  port:       { key: 'port',       label: 'Port' },
  volcano:    { key: 'volcano',    label: 'Volcano' }
};

// Optional hook for future icons/shapes per type.
export function poiClassFor(type) {
  if (type === 'port') return 'poi port';
  if (type === 'volcano') return 'poi volcano';
  return 'poi settlement';
}
