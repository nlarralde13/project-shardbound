// Persist per-room state locally (MVP1). Backend save comes later.
const NS = 'sb_room_state_v1';

function keyOf({ shardId, tileX, tileY, roomX, roomY }) {
  return `${shardId}:${tileX},${tileY}:${roomX},${roomY}`;
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(NS) || '{}'); }
  catch { return {}; }
}

function saveAll(map) {
  localStorage.setItem(NS, JSON.stringify(map));
}

export function getRoomState(ref) {
  const all = loadAll();
  return all[keyOf(ref)];
}

export function setRoomState(ref, state) {
  const all = loadAll();
  all[keyOf(ref)] = state;
  saveAll(all);
}

export function clearRoomState(ref) {
  const all = loadAll();
  delete all[keyOf(ref)];
  saveAll(all);
}
