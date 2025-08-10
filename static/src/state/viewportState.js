// Simple finite-state machine for the viewport.
// States: 'console' | 'world' | 'region' | 'minishard'

const listeners = new Set();

const state = {
  current: 'console',
  payload: null, // e.g., { regionId } or { parentTile }
};

export function onViewportChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { for (const fn of listeners) fn({ ...state }); }

export function getViewportState() { return { ...state }; }
export function setViewportState(next, payload = null) {
  if (state.current === next && JSON.stringify(state.payload) === JSON.stringify(payload)) return;
  state.current = next;
  state.payload = payload;
  emit();
}

// conveniences
export const goConsole   = () => setViewportState('console');
export const goWorld     = (payload = null) => setViewportState('world', payload);
export const goRegion    = (payload) => setViewportState('region', payload);
export const goMiniShard = (payload) => setViewportState('minishard', payload);
