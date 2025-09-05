/**
 * Canonical shard schema + lightweight runtime validators and migration.
 */
export const CANONICAL_VERSION = '1.0.0';
export const POI_TYPES = ['shardgate','site','dungeon','town','resource','spawn','note'];

// Robust UUID generator for browsers without crypto.randomUUID
export function safeUUID(){
  try { if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  try {
    const g = globalThis?.crypto?.getRandomValues?.(new Uint8Array(16));
    if (g) {
      g[6] = (g[6] & 0x0f) | 0x40; // version 4
      g[8] = (g[8] & 0x3f) | 0x80; // variant 10
      const h = Array.from(g, b => b.toString(16).padStart(2,'0')).join('');
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
  } catch {}
  const rnd = () => Math.floor(Math.random()*16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => c==='x' ? rnd() : ((parseInt(rnd(),16)&0x3)|0x8).toString(16));
}

/** Return a color for a biome key. */
export function biomeColor(b) {
  const map = {
    bedrock: '#1f1f1f', grass: '#3a5', forest: '#274', desert: '#dbb', water: '#57a', snow: '#eef', mountain: '#777', swamp:'#486', beach:'#edc', unknown:'#999'
  };
  return map[b] || '#888';
}

/** Validate shard JSON against canonical schema. */
export function validateShard(json) {
  const errors = [];
  if (!json || typeof json !== 'object') errors.push('root: must be object');
  if (!json.shard_id || typeof json.shard_id !== 'string') errors.push('shard_id: required string');
  if (!json.size || typeof json.size.width !== 'number' || typeof json.size.height !== 'number') errors.push('size.width/height required');
  if (!Array.isArray(json.tiles)) errors.push('tiles: 2D array required');
  const H = json.size?.height|0, W = json.size?.width|0;
  if (Array.isArray(json.tiles)) {
    if (json.tiles.length !== H) errors.push(`tiles: height ${json.tiles.length} != size.height ${H}`);
    else {
      for (let y=0;y<json.tiles.length;y++){
        const row = json.tiles[y]; if (!Array.isArray(row) || row.length !== W) { errors.push(`tiles[${y}]: width ${row?.length} != ${W}`); break; }
        for (let x=0;x<row.length;x++){
          const t = row[x];
          if (t.x !== x || t.y !== y) errors.push(`tile[${x},${y}]: mismatched coords`);
          if (typeof t.biome !== 'string') errors.push(`tile[${x},${y}]: biome string required`);
        }
      }
    }
  }
  if (!Array.isArray(json.pois)) errors.push('pois: array required');
  else for (const p of json.pois){
    if (!POI_TYPES.includes(p.type)) errors.push(`poi ${p.id||'?'}: invalid type '${p.type}'`);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') errors.push(`poi ${p.id||'?'}: x,y required`);
    if (p.x<0||p.y<0||p.x>=W||p.y>=H) errors.push(`poi ${p.id||'?'}: coords out of bounds`);
  }
  return { ok: errors.length===0, errors };
}

/** Migrate older shard shapes to canonical. */
export function migrateToCanonicalShard(src) {
  if (!src) return null;
  const looks2D = (a) => Array.isArray(a) && a.length && Array.isArray(a[0]);
  const normCell = (cell, x, y) => {
    if (typeof cell === 'string') return normalizeTile({ biome: cell }, x, y);
    if (cell && typeof cell === 'object') {
      // Support legacy { tile: 'plains' } shape as alias
      const b = (typeof cell.biome === 'string') ? cell.biome : (typeof cell.tile === 'string' ? cell.tile : undefined);
      return normalizeTile(b ? { ...cell, biome: b } : cell, x, y);
    }
    return normalizeTile({}, x, y);
  };
  // Prefer explicit 2D arrays: tiles, else grid
  // If tiles are in flat list, convert to 2D
  let tiles2d = src.tiles;
  if (Array.isArray(src.tiles) && src.tiles.length && !Array.isArray(src.tiles[0])) {
    const W = src.size?.width|0; const H = src.size?.height|0;
    tiles2d = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
      const t = src.tiles.find(tt => tt.x===x && tt.y===y) || { x, y, biome:'bedrock', elevation:0, tags:[], resources:[], flags:{ buildable:false, blocked:false, water:false, spawn:false } };
      return normalizeTile(t, x, y);
    }));
  }
  else if (Array.isArray(src.tiles)) {
    if (looks2D(src.tiles)) tiles2d = src.tiles.map((row,y) => row.map((t,x) => normCell(t,x,y)));
    else tiles2d = src.tiles; // handled above or below
  }
  // If no tiles but grid exists as 2D string/object matrix, use that
  if ((!tiles2d || !Array.isArray(tiles2d)) && looks2D(src.grid)) {
    const W = src.grid[0].length; const H = src.grid.length;
    tiles2d = Array.from({length:H}, (_,y)=> Array.from({length:W}, (_,x)=> normCell(src.grid[y][x], x, y)));
  }
  // Build tiles grid if missing or malformed
  const W = (src.size?.width|0) || (tiles2d?.[0]?.length || 0);
  const H = (src.size?.height|0) || (tiles2d?.length || 0);
  if (!tiles2d || !Array.isArray(tiles2d) || tiles2d.length !== H || (tiles2d[0] && tiles2d[0].length !== W)) {
    tiles2d = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
      const t = src.tiles?.find?.(tt=>tt.x===x&&tt.y===y) || {};
      const b = (typeof t?.biome==='string') ? t.biome : (typeof t?.tile==='string' ? t.tile : undefined);
      return normalizeTile(b? { ...t, biome:b } : t, x, y);
    }));
  }
  // Merge POIs with shardgate nodes from layers/top-level
  const fromPOIs = Array.isArray(src.pois) ? src.pois.slice() : [];
  const fromLayerGates = Array.isArray(src?.layers?.shardgates?.nodes) ? src.layers.shardgates.nodes : [];
  const fromTopGates = Array.isArray(src?.shardgates?.nodes) ? src.shardgates.nodes : [];
  const gateNodes = [...fromLayerGates, ...fromTopGates];
  for (const g of gateNodes) {
    const gx = (g?.x|0), gy = (g?.y|0);
    const exists = fromPOIs.some(p => p?.type === 'shardgate' && (p.x|0) === gx && (p.y|0) === gy);
    if (!exists) {
      fromPOIs.push({ id: g?.id || `gate_${gx}_${gy}`, type: 'shardgate', x: gx, y: gy, name: g?.id || 'Shardgate', icon: 'shardgate', description: '', meta: { link: g?.link } });
    }
  }

  const canonical = {
    shard_id: String(src.shard_id || 'shard_'+Math.random().toString(36).slice(2)),
    version: CANONICAL_VERSION,
    size: { width: W, height: H },
    tiles: tiles2d || [],
    pois: Array.isArray(fromPOIs) ? fromPOIs.map(n => normalizePOI(n)) : [],
    meta: src.meta || { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), author: 'unknown' },
  };
  return canonical;
}

function normalizeTile(t, x, y){
  // Map legacy aliases and synonyms
  const biome = (typeof t?.biome === 'string') ? t.biome
              : (typeof t?.tile === 'string') ? t.tile
              : 'bedrock';
  return {
    x, y,
    biome,
    elevation: Number.isFinite(t?.elevation) ? t.elevation : 0,
    tags: Array.isArray(t?.tags) ? t.tags : [],
    resources: Array.isArray(t?.resources) ? t.resources : [],
    flags: Object.assign({ buildable:false, blocked:false, water:false, spawn:false }, t?.flags || {}),
  };
}
function normalizePOI(p){
  return {
    id: p?.id || safeUUID(),
    type: POI_TYPES.includes(p?.type) ? p.type : 'note',
    x: p?.x|0, y: p?.y|0,
    name: p?.name || '', icon: p?.icon || p?.type || 'note', description: p?.description || '',
    meta: p?.meta || {},
  };
}
