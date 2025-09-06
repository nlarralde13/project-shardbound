// Read-only shard viewer extracted from shard-viewer-v2.js
// Renders shard biomes, infrastructure, settlements and shardgates.
// No editing features or draft persistence.

// Utility helpers
const $ = (id) => document.getElementById(id);
const logAction = (text, extra) => {
  try {
    const logEl = $('actionLog');
    if (!logEl) return;
    const now = new Date();
    const ts = now.toLocaleTimeString([], { hour12: false });
    let line = `[${ts}] ${String(text || '').trim()}`;
    if (extra) {
      try { line += ' ' + JSON.stringify(extra); } catch {}
    }
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  } catch {}
};

// Elements
const els = {
  frame: $('frame'),
  base: $('canvas'),
  scale: $('scale'),
  grid: $('grid'),
  opacity: $('overlayOpacity'),
  palette: $('palette'),
  layerBiomes: $('layerBiomes'),
  layerInfra: $('layerInfra'),
  layerSettlements: $('layerSettlements'),
  layerShardgates: $('layerShardgates')
};
if (!els.base) {
  const c = document.createElement('canvas');
  c.id = 'canvas';
  els.frame?.appendChild(c);
  els.base = c;
}
// overlay canvas
const overlay = document.createElement('canvas');
overlay.id = 'overlayCanvasLite';
overlay.style.pointerEvents = 'none';
els.frame?.appendChild(overlay);
const octx = overlay.getContext('2d');

// tooltip
const tip = document.createElement('div');
tip.id = 'hoverTip';
Object.assign(tip.style, {
  position: 'absolute',
  padding: '2px 4px',
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  fontSize: '12px',
  pointerEvents: 'none',
  zIndex: 1000,
  display: 'none'
});
document.body.appendChild(tip);

const dpr = () => window.devicePixelRatio || 1;
// Default to a 35px tile scale if no control is present
const scale = () => Math.max(1, parseInt(els.scale?.value || '35', 10));
const alpha = () => Math.max(0, Math.min(1, (parseInt(els.opacity?.value || '85', 10) || 85) / 100));

// State
const ST = { shard: null, grid: null, focus: { x: -1, y: -1 }, panX: 0, panY: 0 };

function scheduleDraw() {
  if (scheduleDraw.raf) return;
  scheduleDraw.raf = requestAnimationFrame(() => {
    scheduleDraw.raf = 0;
    drawBase();
    drawOverlay();
  });
}

// Data helpers
const looks2D = (a) => Array.isArray(a) && a.length && Array.isArray(a[0]);
function ensureTilesFromAny(shard) {
  if (!shard) return;
  const asTileObj = (cell, x, y) => {
    if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
      const b = typeof cell.biome === 'string' ? cell.biome : (typeof cell.tile === 'string' ? cell.tile : 'bedrock');
      return {
        x, y, biome: b,
        elevation: Number.isFinite(cell.elevation) ? cell.elevation : 0,
        tags: Array.isArray(cell.tags) ? cell.tags : [],
        resources: Array.isArray(cell.resources) ? cell.resources : [],
        flags: Object.assign({ buildable: false, blocked: false, water: false, spawn: false }, cell.flags || {})
      };
    }
    const b = typeof cell === 'string' ? cell : 'bedrock';
    return { x, y, biome: b, elevation: 0, tags: [], resources: [], flags: { buildable: false, blocked: false, water: false, spawn: false } };
  };
  if (looks2D(shard.tiles)) {
    shard.tiles = shard.tiles.map((row, y) => row.map((c, x) => asTileObj(c, x, y)));
    return;
  }
  if (looks2D(shard.grid)) {
    const H = shard.grid.length, W = shard.grid[0].length;
    shard.tiles = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => asTileObj(shard.grid[y][x], x, y)));
    return;
  }
  shard.tiles = [];
}
function deriveGridFromTiles(shard) {
  if (!shard || !looks2D(shard.tiles)) return [];
  const H = shard.tiles.length, W = shard.tiles[0].length;
  const out = new Array(H);
  for (let y = 0; y < H; y++) {
    const row = shard.tiles[y], line = new Array(W);
    for (let x = 0; x < W; x++) {
      const t = row[x];
      const b = (t && typeof t.biome === 'string') ? t.biome : (t && typeof t.tile === 'string' ? t.tile : 'plains');
      line[x] = String(b).toLowerCase();
    }
    out[y] = line;
  }
  return out;
}

// Sizing and pan
function ensureSizes(W, H) {
  const s = scale();
  if (!W || !H) return;
  if (els.base.width !== W * s || els.base.height !== H * s) {
    els.base.width = W * s;
    els.base.height = H * s;
    els.base.style.width = `${W * s}px`;
    els.base.style.height = `${H * s}px`;
    overlay.width = W * s;
    overlay.height = H * s;
    overlay.style.width = `${W * s}px`;
    overlay.style.height = `${H * s}px`;
  }
}
function applyPan() {
  const x = Math.round(ST.panX || 0), y = Math.round(ST.panY || 0);
  els.base.style.left = x + 'px';
  els.base.style.top = y + 'px';
  overlay.style.left = x + 'px';
  overlay.style.top = y + 'px';
}
function centerInFrame() {
  const fw = els.frame?.clientWidth || 0, fh = els.frame?.clientHeight || 0;
  const cw = els.base?.width || 0, ch = els.base?.height || 0;
  ST.panX = Math.round((fw - cw) / 2);
  ST.panY = Math.round((fh - ch) / 2);
  applyPan();
}

// Biome colors
const BASE_COLORS = {
  ocean: '#0b3a74', river: '#3B90B8', lake: '#2D7DA6', reef: '#1EA3A8',
  coast: '#d9c38c', beach: '#d9c38c',
  plains: '#91c36e', forest: '#2e7d32', savanna: '#C2B33C', shrubland: '#9A8F44', taiga: '#2D6248', jungle: '#1C6B46',
  hills: '#97b06b', mountains: '#8e3c3c', alpine: '#BFCADD', glacier: '#A7D3E9',
  tundra: '#b2c2c2', desert: '#e0c067', volcano: '#A14034', lavafield: '#5B2320',
  urban: '#555555', wetland: '#2E5D4E'
};
const PALETTES = { classic: BASE_COLORS, contrast: BASE_COLORS, pastel: BASE_COLORS, noir: BASE_COLORS };
function biomeColor(id) {
  const pal = PALETTES[els.palette?.value || 'classic'] || PALETTES.classic;
  return pal[String(id).toLowerCase()] || '#889';
}

function drawBase() {
  const g = ST.grid;
  if (!g) return;
  const s = scale();
  const ctx = els.base.getContext('2d');
  ctx.clearRect(0, 0, els.base.width, els.base.height);
  if (els.layerBiomes && !els.layerBiomes.checked) return;
  for (let y = 0; y < g.length; y++) {
    const row = g[y];
    for (let x = 0; x < row.length; x++) {
      ctx.fillStyle = biomeColor(row[x]);
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
}

// Overlay drawing
function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const g = ST.grid;
  if (!g) return;
  const s = scale();
  const [H, W] = [g.length, g[0]?.length || 0];
  if (els.grid?.checked) {
    octx.save();
    octx.globalAlpha = Math.min(1, alpha() + .2);
    octx.strokeStyle = '#233042';
    octx.lineWidth = 1;
    octx.beginPath();
    for (let x = 0; x <= W; x++) {
      const px = x * s; octx.moveTo(px, 0); octx.lineTo(px, H * s);
    }
    for (let y = 0; y <= H; y++) {
      const py = y * s; octx.moveTo(0, py); octx.lineTo(W * s, py);
    }
    octx.stroke();
    octx.restore();
  }
  if (els.layerInfra?.checked) {
    const roads = ST.shard?.layers?.roads?.paths || [];
    octx.save();
    octx.globalAlpha = 1;
    octx.strokeStyle = '#a0a4ad';
    octx.lineWidth = Math.max(1, Math.round(s * 0.12));
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    for (const path of roads) {
      if (!Array.isArray(path) || path.length < 2) continue;
      octx.beginPath();
      for (let i = 0; i < path.length; i++) {
        const [x, y] = path[i];
        const px = (x + 0.5) * s, py = (y + 0.5) * s;
        if (i === 0) octx.moveTo(px, py); else octx.lineTo(px, py);
      }
      octx.stroke();
    }
    octx.restore();
  }
  if (els.layerShardgates?.checked) {
    const gates = (ST.shard?.layers?.shardgates?.nodes || [])
      .concat((ST.shard?.pois || []).filter(p => p?.type === 'shardgate'));
    octx.save();
    const gateMap = new Map();
    for (const g1 of gates) { if (g1?.id) gateMap.set(String(g1.id), g1); }
    octx.globalAlpha = Math.max(.7, alpha());
    octx.strokeStyle = '#7b5cff';
    octx.lineWidth = Math.max(1, Math.round(s * 0.2));
    const drawn = new Set();
    const getLinks = (g) => Array.isArray(g.linked_gates) ? g.linked_gates : (Array.isArray(g.meta?.linked_gates) ? g.meta.linked_gates : []);
    for (const g1 of gates) {
      const idA = String(g1.id || '');
      for (const tid of getLinks(g1)) {
        const tgt = tid ? gateMap.get(String(tid)) : null;
        if (!tgt) continue;
        const idB = String(tid);
        const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
        if (drawn.has(key)) continue; drawn.add(key);
        const x1 = (g1.x ?? g1[0]) | 0, y1 = (g1.y ?? g1[1]) | 0;
        const x2 = (tgt.x ?? tgt[0]) | 0, y2 = (tgt.y ?? tgt[1]) | 0;
        octx.beginPath();
        octx.moveTo((x1 + 0.5) * s, (y1 + 0.5) * s);
        octx.lineTo((x2 + 0.5) * s, (y2 + 0.5) * s);
        octx.stroke();
      }
    }
    octx.globalAlpha = Math.max(.9, alpha());
    octx.fillStyle = '#7b5cff';
    octx.strokeStyle = '#000';
    octx.lineWidth = 1;
    for (const g1 of gates) {
      const x = (g1.x ?? g1[0]) | 0, y = (g1.y ?? g1[1]) | 0;
      const cx = (x + .5) * s, cy = (y + .5) * s, R = Math.max(3, Math.round(s * .36));
      octx.beginPath();
      octx.moveTo(cx, cy - R); octx.lineTo(cx + R, cy); octx.lineTo(cx, cy + R); octx.lineTo(cx - R, cy); octx.closePath();
      octx.fill(); octx.stroke();
    }
    octx.restore();
  }
  if (els.layerSettlements?.checked) {
    const setts = Array.isArray(ST.shard?.settlements) ? ST.shard.settlements : [];
    octx.save();
    const tileSize = s;
    octx.fillStyle = 'rgba(181,136,99,0.35)';
    octx.strokeStyle = '#3b82f6';
    octx.lineWidth = 2;
    for (const sInfo of setts) {
      const b = sInfo.bounds || { x: sInfo.anchor?.x || 0, y: sInfo.anchor?.y || 0, w: sInfo.footprint?.w || 1, h: sInfo.footprint?.h || 1 };
      const sx = b.x * tileSize, sy = b.y * tileSize, sw = b.w * tileSize, sh = b.h * tileSize;
      octx.fillRect(sx, sy, sw, sh);
      octx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    }
    octx.restore();
  }
  if (ST.focus && ST.focus.x >= 0 && ST.focus.y >= 0) {
    const fx = ST.focus.x, fy = ST.focus.y; const fpx = fx * s, fpy = fy * s;
    octx.save();
    octx.globalAlpha = 1;
    octx.strokeStyle = 'rgba(255,214,10,0.95)';
    octx.fillStyle = 'rgba(255,214,10,0.12)';
    octx.lineWidth = 2;
    octx.fillRect(fpx, fpy, s, s);
    octx.strokeRect(fpx + 0.5, fpy + 0.5, s - 1, s - 1);
    octx.restore();
  }
}

// Load shard
export async function loadShard(url) {
  const res = await fetch(url);
  const shard = await res.json();
  ensureTilesFromAny(shard);
  ST.shard = shard;
  ST.grid = deriveGridFromTiles(shard);
  const H = ST.grid.length, W = H ? ST.grid[0].length : 0;
  ensureSizes(W, H);
  centerInFrame();
  scheduleDraw();
  logAction('Loaded shard', { url });
  return shard;
}

// Hover tooltip
function tileAtClient(e) {
  const rect = els.base.getBoundingClientRect();
  const s = scale();
  return {
    x: Math.floor((e.clientX - rect.left) / s),
    y: Math.floor((e.clientY - rect.top) / s)
  };
}
els.frame?.addEventListener('mousemove', (e) => {
  const { x, y } = tileAtClient(e);
  const t = ST.shard?.tiles?.[y]?.[x];
  if (t) {
    tip.style.display = 'block';
    tip.textContent = `${x},${y}: ${t.biome}`;
    tip.style.left = e.clientX + 10 + 'px';
    tip.style.top = e.clientY + 10 + 'px';
  } else {
    tip.style.display = 'none';
  }
});
els.frame?.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

// Focus on click
let dragging = false, dragStartX = 0, dragStartY = 0, startPanX = 0, startPanY = 0;
els.frame?.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  startPanX = ST.panX || 0;
  startPanY = ST.panY || 0;
  els.frame.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
  ST.panX = startPanX + dx;
  ST.panY = startPanY + dy;
  applyPan();
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  const moved = Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY);
  dragging = false;
  els.frame.style.cursor = 'default';
  if (moved < 4) {
    const { x, y } = tileAtClient(e);
    ST.focus = { x, y };
    scheduleDraw();
  }
});
els.frame?.addEventListener('contextmenu', (e) => e.preventDefault());

// Zoom controls
export function setScalePx(px) {
  px = Math.max(4, Math.min(64, Math.round(px)));
  if (els.scale) els.scale.value = String(px);
  if (ST.grid) {
    ensureSizes(ST.grid[0]?.length || 0, ST.grid.length || 0);
    scheduleDraw();
  }
}
function zoomAt(fx, fy, factor) {
  const s1 = scale();
  const s2 = Math.max(4, Math.min(64, Math.round(s1 * factor)));
  if (s2 === s1) return;
  const k = s2 / s1;
  const panX = ST.panX || 0, panY = ST.panY || 0;
  ST.panX = Math.round(fx - (fx - panX) * k);
  ST.panY = Math.round(fy - (fy - panY) * k);
  setScalePx(s2);
  applyPan();
}
function handleWheel(e) {
  e.preventDefault();
  const rect = els.frame.getBoundingClientRect();
  const fx = e.clientX - rect.left;
  const fy = e.clientY - rect.top;
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  zoomAt(fx, fy, factor);
}
els.frame?.addEventListener('wheel', handleWheel, { passive: false });
els.base?.addEventListener('wheel', handleWheel, { passive: false });
$('btnZoomIn')?.addEventListener('click', (e) => { e?.preventDefault?.(); const rect = els.frame.getBoundingClientRect(); zoomAt(rect.width / 2, rect.height / 2, 1.2); });
$('btnZoomOut')?.addEventListener('click', (e) => { e?.preventDefault?.(); const rect = els.frame.getBoundingClientRect(); zoomAt(rect.width / 2, rect.height / 2, 0.8); });
$('btnFit')?.addEventListener('click', (e) => { e?.preventDefault?.(); centerInFrame(); });

// Layer controls
els.scale?.addEventListener('input', () => { if (!ST.grid) return; ensureSizes(ST.grid[0]?.length || 0, ST.grid.length || 0); scheduleDraw(); });
els.grid?.addEventListener('change', () => scheduleDraw());
els.opacity?.addEventListener('input', () => scheduleDraw());
els.layerBiomes?.addEventListener('change', () => scheduleDraw());
els.layerInfra?.addEventListener('change', () => scheduleDraw());
els.layerSettlements?.addEventListener('change', () => scheduleDraw());
els.layerShardgates?.addEventListener('change', () => scheduleDraw());
els.palette?.addEventListener('change', () => scheduleDraw());

// public API
export function currentShard() { return ST.shard; }
