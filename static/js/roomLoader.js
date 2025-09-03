// roomLoader.js — canonical shard tiles, art resolution, biome summary, and room builder

// Optional base for relative art paths. Leave empty; do not guess a base.
const BASE_ROOM_ART = '';

// Module-local shard state
let _shard = null;

// Biome alias map
const BIOME_ALIASES = new Map([
  // water
  ['ocean', 'water'], ['sea', 'water'], ['water', 'water'],
  // coast
  ['coast', 'coast'], ['beach', 'coast'], ['shore', 'coast'],
  // plains
  ['plains', 'plains'], ['grass', 'plains'], ['grassland', 'plains'], ['meadow', 'plains'],
  // forest
  ['forest', 'forest'], ['woods', 'forest'],
  // desert
  ['desert', 'desert'], ['sand', 'desert'],
  // tundra
  ['tundra', 'tundra'], ['snow', 'tundra'], ['ice', 'tundra'],
  // swamp
  ['swamp', 'swamp'], ['marsh', 'swamp'],
  // hills
  ['hills', 'hills'], ['hill', 'hills'],
  // mountain
  ['mountain', 'mountain'], ['mountains', 'mountain'],
  // settlements/specials keep identity
  ['city', 'city'], ['town', 'town'], ['village', 'village'], ['port', 'port'], ['dungeon', 'dungeon'], ['volcano', 'volcano'],
]);

// Normalize a biome token with small alias map
export function normalizeBiome(v) {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return 'unknown';
  return BIOME_ALIASES.get(t) || t;
}

// Resolve art path from legacy fields
export function resolveArtPath(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
  return BASE_ROOM_ART ? (BASE_ROOM_ART + s) : s;
}

function ensureTags(val) {
  if (Array.isArray(val)) return val.slice();
  if (val == null) return [];
  return [String(val)];
}

// Canonicalize a single cell to a tile object, preserving unknown/custom fields
function toTile(cell) {
  if (cell == null) {
    return { biome: 'void', type: 'void', terrain: 'void', elevation: 0, tags: [] };
  }
  if (typeof cell === 'string' || typeof cell === 'number') {
    const b = normalizeBiome(cell);
    return { biome: b, type: b, terrain: b, elevation: 0, tags: [], artSrc: '' };
  }
  if (typeof cell === 'object') {
    const rawBiome = cell.biome ?? cell.type ?? cell.terrain ?? cell.b ?? cell.t ?? cell.tile ?? 'unknown';
    const biome = normalizeBiome(rawBiome);
    const elevation = Number.isFinite(cell.elevation) ? cell.elevation : Number(cell.elevation) || 0;
    const tags = ensureTags(cell.tags);
    const artSrc = resolveArtPath(cell.artSrc || cell.art || cell.image || cell.bg || cell.background || '');
    const type = cell.type || biome;
    const terrain = cell.terrain || biome;
    const poi = cell.poi || cell.site || undefined;
    return { ...cell, biome, type, terrain, elevation, tags, artSrc, ...(poi ? { poi } : {}) };
  }
  const b = normalizeBiome(cell);
  return { biome: b, type: b, terrain: b, elevation: 0, tags: [], artSrc: '' };
}

// Validate and canonicalize tiles (accepts shard or tiles array)
export function assertCanonicalTiles(tilesOrShard) {
  const tiles = Array.isArray(tilesOrShard) ? tilesOrShard : tilesOrShard?.tiles;
  if (!Array.isArray(tiles) || !Array.isArray(tiles[0])) {
    throw new Error('Shard tiles must be a 2D array');
  }
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    if (!Array.isArray(row)) throw new Error('Shard tiles must be a 2D array');
    for (let x = 0; x < row.length; x++) {
      row[x] = toTile(row[x]);
    }
  }
}

// Cache shard internally after canonicalization
export function setRoomShard(shard) {
  if (!shard || typeof shard !== 'object') throw new Error('setRoomShard() requires a shard object');
  assertCanonicalTiles(shard);
  _shard = shard;
}

// Optional getter
export function getRoomShard() { return _shard; }

// Summarize biome counts (includes total)
export function summarizeBiomes(tiles) {
  const g = tiles || _shard?.tiles;
  const out = { total: 0 };
  if (!Array.isArray(g) || !Array.isArray(g[0])) return out;
  for (let y = 0; y < g.length; y++) {
    const row = g[y]; if (!Array.isArray(row)) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      const token = normalizeBiome(
        typeof cell === 'object' && cell
          ? (cell.biome || cell.type || cell.terrain || cell.tile || 'unknown')
          : cell
      );
      out[token] = (out[token] || 0) + 1;
      out.total++;
    }
  }
  return out;
}

// ---- Helpers for room building ----
function inBounds(x, y) {
  if (!_shard?.tiles) return false;
  return y >= 0 && y < _shard.tiles.length && x >= 0 && x < _shard.tiles[0].length;
}

function getTile(x, y) { if (!inBounds(x, y)) return null; return _shard.tiles[y][x]; }

function regionNameFor(x, y) {
  if (!_shard?.tiles) return 'C';
  const h = _shard.tiles.length, w = _shard.tiles[0].length;
  const rx = Math.max(0, Math.min(2, Math.floor((x / Math.max(1, w)) * 3)));
  const ry = Math.max(0, Math.min(2, Math.floor((y / Math.max(1, h)) * 3)));
  const grid = [['NW','N','NE'],['W','C','E'],['SW','S','SE']];
  return grid[ry]?.[rx] || 'C';
}

function titleForTile(x, y, tile) {
  const base = tile?.poi?.name || tile?.name || tile?.biome || tile?.type || 'unknown';
  return `${base} (${x},${y})`;
}

// Build a room object for coordinates
export function buildRoom(x, y, opts = {}) {
  if (!_shard) {
    return { x, y, biome: 'unloaded', elevation: 0, tags: [], title: `Unloaded (${x},${y})`, flavor: 'The world engine is not ready.' };
  }
  const tile = getTile(x, y);
  if (!tile) {
    return { x, y, biome: 'void', elevation: 0, tags: [], title: `Beyond the Shard (${x},${y})`, flavor: 'A swirling nothingness stretches out here.' };
  }
  const biome = tile.biome || tile.type || 'unknown';
  const elevation = Number.isFinite(tile.elevation) ? tile.elevation : 0;
  const tags = Array.isArray(tile.tags) ? tile.tags.slice() : [];
  const region = regionNameFor(x, y);
  const flavor = tile.poi?.desc || (
    biome === 'forest' ? 'Tall trees whisper as a breeze passes through.' :
    biome === 'desert' ? 'Heat shimmers above endless dunes.' :
    biome === 'tundra' ? 'An icy wind bites through the silence.' :
    biome === 'water'  ? 'Waves lap quietly against an unseen shore.' :
    'There is a quiet stillness here.'
  );
  const artSrc = resolveArtPath(tile.artSrc || tile.art || tile.image || tile.bg || tile.background || '');

  return {
    x, y,
    biome,
    elevation,
    tags,
    resources: tile.resources,
    poi: tile.poi,
    title: titleForTile(x, y, tile),
    flavor,
    artSrc,
    region,
    color: tile.color,
    mode: opts.mode || 'idle'
  };
}
