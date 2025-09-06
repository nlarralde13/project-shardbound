// static/js/roomPatcher.js
// Merge server room_delta into your in-memory room snapshot (if you keep one).

export function applyRoomDelta(room, delta) {
  if (!room || !delta) return room;
  // Shallow arrays we know about: resources, enemies, searchables
  if (Array.isArray(delta.resources)) room.resources = delta.resources;
  if (Array.isArray(delta.enemies)) room.enemies = delta.enemies;
  if (Array.isArray(delta.searchables)) room.searchables = delta.searchables;
  return room;
}
