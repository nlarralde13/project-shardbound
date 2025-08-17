// /static/src/slices/generateMiniShard.js
// Deterministic 4×4 miniShard generator with fog-of-war + room state persistence.
import { rngFrom } from "../utils/rng.js";
import { rollMobArchetypes, rollResource, rollHazard } from "../data/encounterTables.js";
import { rollSliceLoot } from "../data/lootTables.js";

const SLICE_W = 4;
const SLICE_H = 4;
const STORE_KEY = "sb_slice_state_v1";

const BIOME_DANGER_WEIGHT = {
  plains: 0.05, forest: 0.15, desert: 0.20, tropical: 0.18, tundra: 0.20,
  mountains: 0.25, volcanic_rim: 0.30, wetlands: 0.22, coast: 0.10
};

function _loadStore(){ try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; } }
function _saveStore(obj){ localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }
function _sliceKey({ worldSeed, shardId, tileX, tileY }){ return `w:${worldSeed}|s:${shardId}|tx:${tileX}|ty:${tileY}`; }
function _loadSliceByKey(key){ return _loadStore()[key] || null; }
function _saveSliceByKey(key, data){ const s=_loadStore(); s[key]=data; _saveStore(s); }

function _computeRoomDL({ biome, roomX, roomY, rng }){
  const base = BIOME_DANGER_WEIGHT[biome] ?? 0.05;
  const posNudge = ((roomX + roomY) % 2 === 0) ? 0.03 : 0.0;
  const score = Math.max(0, Math.min(1, base + posNudge + rng.float()*0.05));
  return Math.max(0, Math.min(5, Math.floor(score * 6)));
}

function _decideRoomKind(r){
  if (r < 0.45) return "mob";
  if (r < 0.80) return "resource";
  if (r < 0.95) return "hazard";
  return "chest";
}

function _buildRoom({ biome, roomX, roomY, worldSeed, shardId, tileX, tileY, playerId }){
  const rng = rngFrom({ worldSeed, shardId, tileX, tileY, roomX, roomY, playerId, systemTag: "SPAWN" });
  const DL = _computeRoomDL({ biome, roomX, roomY, rng });
  const kind = _decideRoomKind(rng.float());

  if (kind === "mob"){
    const mobs = rollMobArchetypes({ biome, DL, count: 1, rng });
    return { kind, DL, mobs, resolved: false, revealed: false, loot: null };
  }
  if (kind === "resource"){
    const node = rollResource({ biome, rng });
    const lootId = rollSliceLoot({
      worldSeed, shardId, tileX, tileY, roomX, roomY, playerId,
      biome, dangerLevel: Math.max(DL, 1), forNode: true
    });
    return { kind, DL, node, resolved: false, revealed: false, loot: lootId };
  }
  if (kind === "hazard"){
    const hazard = rollHazard({ biome, rng });
    return { kind, DL, hazard, resolved: false, revealed: false, loot: null };
  }
  // chest (+ optional bonus handled by overlay/consumer)
  const chestLoot = rollSliceLoot({
    worldSeed, shardId, tileX, tileY, roomX, roomY, playerId,
    biome, dangerLevel: DL
  });
  const bonus = rollSliceLoot({
    worldSeed, shardId, tileX, tileY, roomX, roomY, playerId,
    biome, dangerLevel: DL
  });
  return { kind: "chest", DL, chest: true, resolved: false, revealed: false, loot: chestLoot, bonus };
}

function _pickEntryExit({ worldSeed, shardId, tileX, tileY, playerId }){
  const rng = rngFrom({ worldSeed, shardId, tileX, tileY, playerId, systemTag: "EXIT_PICK" });
  const edges = [
    {x:0, y:rng.int(0, SLICE_H-1)},
    {x:SLICE_W-1, y:rng.int(0, SLICE_H-1)},
    {x:rng.int(0, SLICE_W-1), y:0},
    {x:rng.int(0, SLICE_W-1), y:SLICE_H-1}
  ];
  const entry = edges[rng.int(0, edges.length-1)];
  let best = edges[0], bestD = -1;
  for (const e of edges){
    const d = Math.abs(e.x-entry.x) + Math.abs(e.y-entry.y);
    if (d > bestD){ bestD = d; best = e; }
  }
  return { entry, exit: best };
}

// ---------------------------- Public API --------------------------------------
export async function generateMiniShard(params){
  const { worldSeed, shardId, tileX, tileY, biome="plains", tileType="wild", playerId="localDevPlayer", options = { fogOfWar: true } } = params || {};
  const key = _sliceKey({ worldSeed, shardId, tileX, tileY });

  const existing = _loadSliceByKey(key);
  if (existing) {
    window.dispatchEvent(new CustomEvent("slice:open", { detail: existing }));
    return existing;
  }

  const { entry, exit } = _pickEntryExit({ worldSeed, shardId, tileX, tileY, playerId });

  const rooms = [];
  for (let y=0; y<SLICE_H; y++){
    const row = [];
    for (let x=0; x<SLICE_W; x++){
      const room = _buildRoom({ biome, roomX:x, roomY:y, worldSeed, shardId, tileX, tileY, playerId });
      if (x === entry.x && y === entry.y) room.revealed = true;
      row.push(room);
    }
    rooms.push(row);
  }

  const sliceData = { key, shardId, tileX, tileY, biome, tileType, width: SLICE_W, height: SLICE_H, entry, exit, rooms, options };
  _saveSliceByKey(key, sliceData);
  window.dispatchEvent(new CustomEvent("slice:open", { detail: sliceData }));
  return sliceData;
}

export function getMiniShard({ worldSeed, shardId, tileX, tileY }){
  const key = _sliceKey({ worldSeed, shardId, tileX, tileY });
  return _loadSliceByKey(key);
}

export function revealRoom({ worldSeed, shardId, tileX, tileY, roomX, roomY }){
  const key = _sliceKey({ worldSeed, shardId, tileX, tileY });
  const slice = _loadSliceByKey(key);
  if (!slice) return null;
  const r = slice.rooms?.[roomY]?.[roomX];
  if (r && !r.revealed) {
    r.revealed = true;
    _saveSliceByKey(key, slice);
    window.dispatchEvent(new CustomEvent("slice:update", { detail: { key, roomX, roomY, patch: { revealed: true } }}));
  }
  return slice;
}

export function resolveRoom({ worldSeed, shardId, tileX, tileY, roomX, roomY, loot = undefined }){
  const key = _sliceKey({ worldSeed, shardId, tileX, tileY });
  const slice = _loadSliceByKey(key);
  if (!slice) return null;
  const r = slice.rooms?.[roomY]?.[roomX];
  if (!r) return null;
  r.resolved = true;
  r.revealed = true;
  if (loot !== undefined) r.loot = loot;

  _saveSliceByKey(key, slice);
  window.dispatchEvent(new CustomEvent("slice:update", {
    detail: { key, roomX, roomY, patch: { resolved: true, revealed: true, loot: r.loot } }
  }));
  return slice;
}

export function markRoomCleared({ worldSeed, shardId, tileX, tileY, roomX, roomY, loot = undefined }){
  return resolveRoom({ worldSeed, shardId, tileX, tileY, roomX, roomY, loot });
}

export function clearMiniShard({ worldSeed, shardId, tileX, tileY }){
  const key = _sliceKey({ worldSeed, shardId, tileX, tileY });
  const store = _loadStore();
  if (store[key]) {
    delete store[key];
    _saveStore(store);
    window.dispatchEvent(new CustomEvent("slice:closed", { detail: { key } }));
    return true;
  }
  return false;
}
