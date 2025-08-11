// /static/src/state/viewportState.js
// Simple FSM + tiny pub/sub. Adds shard/slice/room and aliases for back-compat.

const listeners = new Set();

const state = {
  current: 'console',   // 'console' | 'shard' | 'slice' | 'room'
  payload: null,
};

export function onViewportChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() { for (const fn of listeners) fn({ ...state }); }

export function getViewportState() { return { ...state }; }
export function setViewportState(next, payload = null) {
  // normalize legacy names to the new ones
  const map = { world: 'shard', region: 'slice', minishard: 'slice' };
  const normalized = map[next] || next;

  if (state.current === normalized && JSON.stringify(state.payload) === JSON.stringify(payload)) return;
  state.current = normalized;
  state.payload = payload;
  emit();
}

// New canonical helpers
export const goConsole = () => setViewportState('console');
export const goShard   = (payload = null) => setViewportState('shard', payload);
export const goSlice   = (payload = null) => setViewportState('slice', payload);
export const goRoom    = (payload = null) => setViewportState('room',  payload);

// Back-compat aliases so older code/HUD keeps working
export const goWorld     = (payload = null) => setViewportState('shard', payload);
export const goRegion    = (payload = null) => setViewportState('slice', payload);
export const goMiniShard = (payload = null) => setViewportState('slice', payload);
