// roomLoader.js
// Single source of truth for *room data* derived from the shard.
//
// Exposes:
//   setShard(shard)
//   assertCanonicalTiles(tiles)
//   getBiomeAt(x,y)
//   getSiteAt(x,y)
//   buildRoom(x,y) -> { x, y, biome, title, subtitle, label?, site?, description, art:{image,size,position,repeat,stack,layers,frames?,frame_ms?,animIndex?} }

import { BIOMES, canonicalBiome, randomTitleFor, ALL_BIOME_KEYS } from '/static/js/biomeRegistry.js';
import { canonicalSettlement, imgForSettlement } from '/static/js/settlementRegistry.js';

let Shard = null;
const ALLOWED_BIOMES = new Set(ALL_BIOME_KEYS);
const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'port']);

// --- lightweight caches -----------------------------------------------------
const _artCache = new Map();  // key: `${biome}|${siteTypeOr-}` -> art object
const _imgMemo  = new Map();  // url -> HTMLImageElement (best-effort preload)

function preload(url) {
  if (!url) return null;
  if (_imgMemo.has(url)) return _imgMemo.get(url);
  const img = new Image(); img.src = url; _imgMemo.set(url, img); return img;
}

// --- helpers ----------------------------------------------------------------
export function setShard(shard) {
  Shard = shard || null;
  _artCache.clear(); // safe to clear between shards
}

export function assertCanonicalTiles(tiles) {
  if (!Array.isArray(tiles) || !tiles.length || !Array.isArray(tiles[0])) {
    throw new Error('Shard tiles must be a 2D array');
  }
  const bad = new Set();
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[0].length; x++) {
      let raw = tiles[y][x];
      if (typeof raw === 'object') {
        raw = raw?.tile ?? raw?.biome ?? raw?.type ?? raw?.tag;
        tiles[y][x] = raw;
      }
      const lower = String(raw).toLowerCase();
      if (SETTLEMENT_TYPES.has(lower)) {
        tiles[y][x] = lower;
        continue;
      }
      const canon = canonicalBiome(raw);
      if (!ALLOWED_BIOMES.has(canon)) bad.add(raw);
      tiles[y][x] = canon;
    }
  }
  if (bad.size) {
    console.warn('[roomLoader] Non-canonical biomes:', [...bad]);
    if (Shard) Shard.__warnedNonCanon = true;
  }
}

export function getBiomeAt(x, y) {
  const g = Shard?.tiles;
  if (!g) return 'Plains';
  if (y < 0 || x < 0 || y >= g.length || x >= g[0].length) return 'Plains';
  const raw = g[y][x];
  if (SETTLEMENT_TYPES.has(raw)) return 'Urban';
  return canonicalBiome(raw);
}
export function getSiteAt(x, y) {
  const sites = Shard?.sites || [];
  return sites.find(s => s.x === x && s.y === y) || null;
}

function describe(b) {
  // Flavor text (short)
  return ({
    Coast: 'Salt on the wind. The surf murmurs against the sand.',
    Forest: 'Canopy whispers above; the understory is alive with quiet motion.',
    Plains: 'Open land rolls out, grass bowing in the breeze.',
    Wetland: 'Sodden earth clings to your boots; life hums in the reeds.',
    Hills: 'The ground swells gently; horizons tilt and sway.',
    Mountains: 'Cold air thins. Stone rises like the backs of giants.',
    Volcano: 'Heat wavers. The ground thrums with a distant growl.',
    Tundra: 'Brittle air and long shadow. The world speaks in pale whispers.',
    Desert: 'Heat shimmer dances; sand sings with each step.',
  }[b] || 'You stand at a crossroads of the unknown.');
}

/** Build layered background (top→bottom: POI, biome art, tint). Memoized by key.
 *  Optional `mode` switches art variants (e.g. combat).
 */
function buildArtStack({ biome, site, mode = 'idle' }) {
  const entry = BIOMES[biome] || BIOMES.Forest;

  const siteKey = site ? (site.type || 'site') : '-';
  const key = `${biome}|${siteKey}|${mode}`;
  const cached = _artCache.get(key);
  if (cached) return cached;

  // Build layer list (TOP -> BOTTOM), then convert to CSS stacks
  const layers = [];

  // Optional POI/site image on top
  if (site) {
    const poiImg = imgForSettlement(site.type);
    if (poiImg) layers.push(`url("${poiImg}")`);
    if (poiImg) preload(poiImg);
  }

  // Biome base (static or first frame if animated)
  let frames = null;
  let frame_ms = null;
  let animIndex = null; // which layer in `layers` is animated

  if (mode === 'combat' && entry.art_combat) {
    layers.push(`url("${entry.art_combat}")`);
    preload(entry.art_combat);
  } else if (Array.isArray(entry.frames) && entry.frames.length > 0) {
    frames = entry.frames.slice();
    frames.forEach(preload);
    layers.push(`url("${frames[0]}")`);
    frame_ms = entry.frame_ms ?? 120;
    animIndex = layers.length - 1; // last pushed (the biome texture)
  } else if (entry.art) {
    layers.push(`url("${entry.art}")`);
    preload(entry.art);
  }

  // Tint/gradient on bottom (or make gradient semi-transparent to put on top)
  if (entry.tint) layers.push(entry.tint);

  // Convert arrays to CSS background strings
  const image    = layers.join(', ');
  const size     = new Array(layers.length).fill('cover').join(', ');
  const position = new Array(layers.length).fill('center').join(', ');
  const repeat   = new Array(layers.length).fill('no-repeat').join(', ');

  const out = { image, size, position, repeat, stack: image, layers, frames, frame_ms, animIndex };
  _artCache.set(key, out);
  return out;
}

/** Public: build a stable "room" view model the UI can render. */
export function buildRoom(x, y, { mode = 'idle' } = {}) {
  const biome = getBiomeAt(x, y);
  const site  = getSiteAt(x, y);
  const label = site ? canonicalSettlement(site.type) : null;

  const title    = site ? (site.name || label) : randomTitleFor(biome);
  const subtitle = site ? label : biome;

  const art = buildArtStack({ biome, site, mode });
  const description = site?.flavor || describe(biome);

  return Object.freeze({
    x, y, biome, site, label, title, subtitle, description,
    art, id: `${x},${y}`,
  });
}
