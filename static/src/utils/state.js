const state = { showGrid: false, selectedTile: null };
export function getState(key) { return state[key]; }
export function setState(key, val) { state[key] = val; }