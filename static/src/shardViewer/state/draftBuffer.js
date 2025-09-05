// Lightweight client-side draft buffer for editor actions.
// Accumulates placements and tile patches until the user clicks Save All.

const draft = {
  settlements: {}, // { settlementId: SettlementDraft }
  tiles: {},       // { `${x},${y}`: Partial<TilePatch> }
};

export function queueSettlement(settlementDraft) {
  draft.settlements[settlementDraft.id] = settlementDraft;
}

export function queueTilePatch(x, y, patch) {
  const k = `${x},${y}`;
  draft.tiles[k] = { ...(draft.tiles[k] || {}), ...patch };
}

export function getDraft() { return draft; }

export function clearDraft() {
  draft.settlements = {};
  draft.tiles = {};
}

export function exportDraftPayload() {
  try { return structuredClone(draft); } catch { return JSON.parse(JSON.stringify(draft)); }
}

