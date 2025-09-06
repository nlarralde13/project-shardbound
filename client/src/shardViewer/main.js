/**
 * Modern Shard Editor - main orchestrator (keep thin)
 * Wires UI, camera, renderer, tools, events, API, schema.
 */
import { createAPI } from './apiClient.js';
import { createCamera } from './camera.js';
import { createRenderer } from './renderMap.js';
import { createOverlay } from './mapOverlay.js';
import { createToolState, installKeybinds } from './devTools.js';
import { installMapEvents } from './mapEvents.js';
import { createContextMenu } from './contextMenu.js';
import { migrateToCanonicalShard, validateShard } from './schema.js';
import { createPoiPalette } from './poiPalette.js';
import { createInspector } from './inspectorPanel.js';
import { createUndoRedo } from './undoRedo.js';

const qs = (s) => document.querySelector(s);

// DOM references
const els = {
  canvasBase: qs('#canvasBase'),
  canvasOverlay: qs('#canvasOverlay'),
  canvasUI: qs('#canvasUI'),
  viewport: qs('#viewport'),
  hoverTooltip: qs('#hoverTooltip'),
  zoomLbl: qs('#zoomLbl'),
  fileInput: qs('#fileInput'),
  btnLoad: qs('#btnLoad'),
  btnSave: qs('#btnSave'),
  btnUndo: qs('#btnUndo'),
  btnRedo: qs('#btnRedo'),
  btnZoomIn: qs('#btnZoomIn'),
  btnZoomOut: qs('#btnZoomOut'),
  toggleGrid: qs('#toggleGrid'),
  toggleRegions: qs('#toggleRegions'),
  togglePOI: qs('#togglePOI'),
  brushSize: qs('#brushSize'),
  snapGrid: qs('#snapGrid'),
  dock: qs('#dock'),
  poiPalette: qs('#poiPalette'),
  inspector: qs('#inspector'),
  consolePanel: qs('#consolePanel'),
};

// Global-ish editor state (kept small)
const state = {
  devMode: new URLSearchParams(location.search).get('devMode') === '1',
  shard: null,              // canonical shard JSON
  shardDirty: false,
  visibleOnly: true,        // lazy render
  show: { grid: true, regions: false, poi: true },
  baseline: null,           // snapshot at load or last save
};

// Core services
const api = createAPI({ baseUrl: '/api', consoleEl: els.consolePanel });
const cam = createCamera({
  canvas: els.canvasBase,
  onZoomChange: (z) => { els.zoomLbl.textContent = Math.round(z * 100) + '%'; scheduleDraw(); },
});
const tools = createToolState({
  devMode: state.devMode,
  brushSizeEl: els.brushSize,
  snapGridEl: els.snapGrid,
  onChange: () => scheduleDraw(),
});
const undo = createUndoRedo({ depth: 50, onChange: () => updateUndoRedoButtons() });
const overlay = createOverlay({
  overlayCanvas: els.canvasOverlay,
  uiCanvas: els.canvasUI,
  getState: () => ({ cam, shard: state.shard, show: state.show, tools }),
});
const renderer = createRenderer({
  baseCanvas: els.canvasBase,
  getState: () => ({ cam, shard: state.shard, show: state.show, tools }),
  onHover: (info) => updateTooltip(info),
});
const ctxMenu = createContextMenu({
  onSelect: ({ type, tile, defaults }) => {
    const detail = {
      shard_id: state.shard?.shard_id || 'unknown',
      tile: { x: tile.x, y: tile.y },
      place: { type, defaults },
      source: 'contextMenu'
    };
    document.dispatchEvent(new CustomEvent('editor:placeRequested', { detail }));
  }
});

// Panels
createPoiPalette({ mount: els.poiPalette, tools, onSelect: () => {} });
const inspector = createInspector({ mount: els.inspector, tools, onApply: handleInspectorApply, onDelete: handleInspectorDelete, onPickTarget: handlePickTarget });

// Event wiring
const worker = new Worker('/static/src/workers/editorWorker.js', { type: 'module' });
worker.onmessage = (e) => {
  if (e.data?.type === 'floodFill:done') {
    const changes = e.data.changes || [];
    if (!changes.length) return;
    const before = changes.map(({x,y}) => ({ x, y, biome: state.shard.tiles[y][x].biome }));
    for (const c of changes) state.shard.tiles[c.y][c.x].biome = c.biome;
    undo.push({ label: `Flood fill ${changes.length}`, forward: { type:'tiles', changes }, inverse: { type:'tiles', changes: before } });
    scheduleDraw();
  }
};

installMapEvents({
  canvases: [els.canvasBase, els.canvasOverlay, els.canvasUI],
  cam,
  tools,
  getShard: () => state.shard,
  onPaintBiome: batchPaintBiome,
  onFloodFill: handleFloodFill,
  onPlacePOI: placePOI,
  onMovePOI: movePOI,
  onSelectRect: (rect) => { tools.setSelection(rect); scheduleDraw(); },
  onRequestRedraw: () => scheduleDraw(),
  onTileClick: ({ x, y, tile }) => {
    // Prefer inspecting a POI if present at this tile; else inspect tile.
    const poi = state.shard?.pois?.find?.(p => p.x === x && p.y === y);
    if (poi) inspector.inspectPOI(poi);
    else { logTile(x, y, tile); inspector.inspectTile(tile); }
  },
  onOpenContext: ({ tile, screen }) => ctxMenu.open({ tile, screen })
});
installKeybinds({
  tools,
  onSave: () => saveShard(),
  onLoad: () => els.fileInput.click(),
  onUndo: () => doUndo(),
  onRedo: () => doRedo(),
  onToggleGrid: () => { els.toggleGrid.click(); },
  onToggleRegions: () => { els.toggleRegions.click(); },
  onPan: (dx,dy) => { cam.pan(dx,dy); scheduleDraw(); },
});

els.btnLoad.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', handleFileLoad);
els.btnSave.addEventListener('click', () => saveShard());
els.btnUndo.addEventListener('click', () => doUndo());
els.btnRedo.addEventListener('click', () => doRedo());
qs('#btnRevertAll')?.addEventListener('click', () => revertAll());
els.btnZoomIn.addEventListener('click', () => cam.zoomDelta(+0.1));
els.btnZoomOut.addEventListener('click', () => cam.zoomDelta(-0.1));
els.toggleGrid.addEventListener('change', () => { state.show.grid = els.toggleGrid.checked; scheduleDraw(); });
els.toggleRegions.addEventListener('change', () => { state.show.regions = els.toggleRegions.checked; scheduleDraw(); });
els.togglePOI.addEventListener('change', () => { state.show.poi = els.togglePOI.checked; scheduleDraw(); });

// RAF coalescing token declared before any draw call to avoid TDZ
let raf = 0;
window.addEventListener('resize', () => fitCanvases());
fitCanvases();

// Optional: auto-load via query param ?shard=static/public/shards/....json
const params = new URLSearchParams(location.search);
const qpShard = params.get('shard');
const qpShardId = params.get('shardId');
if (qpShard) fetch(qpShard).then(r => r.json()).then(loadShard).catch(err => logError('Failed to load shard from URL', err));
else if (qpShardId) api.getShard(qpShardId).then(loadShard).catch(err => logError('Failed to load shard from API', err));

// -- impls --

function fitCanvases() {
  const rect = els.viewport.getBoundingClientRect();
  for (const c of [els.canvasBase, els.canvasOverlay, els.canvasUI]) {
    c.width = Math.max(64, Math.floor(rect.width));
    c.height = Math.max(64, Math.floor(rect.height));
  }
  scheduleDraw();
}

/** Schedule a full draw for base + overlays (debounced by RAF). */
function scheduleDraw() {
  if (raf) return; // coalesce
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!state.shard) return;
    // Close transient UI like context menu on redraw to keep in sync
    try { ctxMenu?.close?.(); } catch {}
    renderer.draw();
    overlay.draw();
  });
}

function updateTooltip(info) {
  const el = els.hoverTooltip;
  if (!info) { el.setAttribute('aria-hidden', 'true'); return; }
  const { x, y, biome, elevation, flags } = info;
  const dev = state.devMode ? `\nalt: z=${elevation} b=${flags?.blocked?'1':'0'}` : '';
  el.textContent = `(${x},${y}) ${biome}${dev}`;
  el.style.left = info.screenX + 12 + 'px';
  el.style.top = info.screenY + 12 + 'px';
  el.setAttribute('aria-hidden', 'false');
}

async function handleFileLoad(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    loadShard(json);
  } catch (err) { logError('Invalid JSON file', err); }
}

function loadShard(json) {
  const migrated = migrateToCanonicalShard(json);
  const res = validateShard(migrated);
  if (!res.ok) { logError('Schema validation failed', res.errors); return; }
  state.shard = migrated;
  state.shardDirty = false;
  state.baseline = structuredClone(migrated);
  undo.clear();
  // center camera
  cam.setWorldSize(migrated.size.width, migrated.size.height);
  cam.centerOn(Math.floor(migrated.size.width / 2), Math.floor(migrated.size.height / 2));
  inspector.showWelcome();\n  try { window.__SV_SHARD__ = state.shard; } catch {}\n  scheduleDraw();
}

async function saveShard() {
  if (!state.shard) return;
  const res = validateShard(state.shard);
  if (!res.ok) { logError('Cannot save: schema issues', res.errors); return; }
  try {
    const cid = state.shard.shard_id || 'unknown';
    await api.saveShard(cid, state.shard);
    state.shardDirty = false;
    state.baseline = structuredClone(state.shard);
    undo.clear();
    toast('Saved');
  } catch (err) { logError('Save failed', err); }
}

function doUndo() {
  const action = undo.undo();
  if (!action) return;
  applyAction(action.inverse);
}
function doRedo() {
  const action = undo.redo();
  if (!action) return;
  applyAction(action.forward);
}
function updateUndoRedoButtons() {
  els.btnUndo.disabled = !undo.canUndo();
  els.btnRedo.disabled = !undo.canRedo();
}

function revertAll() {
  if (!state.baseline) return;
  state.shard = structuredClone(state.baseline);
  undo.clear();
  state.shardDirty = false;
  inspector.showWelcome();\n  try { window.__SV_SHARD__ = state.shard; } catch {}\n  scheduleDraw();
  toast('Reverted to last load/save');
}

function batchPaintBiome(tiles, biome) {
  if (!state.shard) return;
  const changes = [];
  for (const { x, y } of tiles) {
    const t = state.shard.tiles[y]?.[x];
    if (!t || t.biome === biome) continue;
    changes.push({ x, y, before: t.biome, after: biome });
    t.biome = biome;
  }
  if (changes.length) {
    undo.push({
      label: `Paint ${changes.length} tiles`,
      forward: { type: 'tiles', changes: changes.map(c => ({ x: c.x, y: c.y, biome: c.after })) },
      inverse: { type: 'tiles', changes: changes.map(c => ({ x: c.x, y: c.y, biome: c.before })) },
    });
    state.shardDirty = true;
    scheduleDraw();
  }
}

function handleFloodFill(startTile) {
  if (!state.shard) return;
  const t = state.shard.tiles[startTile.y]?.[startTile.x];
  if (!t) return;
  const matchBiome = t.biome;
  const newBiome = tools.currentBiome || 'grass';
  if (matchBiome === newBiome) return;
  try {
    worker.postMessage({ type:'floodFill', tiles: state.shard.tiles, start: startTile, matchBiome, newBiome });
  } catch (e) {
    // fallback: do small fill synchronously
    const changes = simpleFloodFill(state.shard.tiles, startTile, matchBiome, newBiome);
    for (const c of changes) state.shard.tiles[c.y][c.x].biome = c.biome;
    undo.push({ label: `Flood fill ${changes.length}`, forward: { type:'tiles', changes }, inverse: { type:'tiles', changes: changes.map(c=>({x:c.x,y:c.y,biome:matchBiome})) } });
    scheduleDraw();
  }
}
function simpleFloodFill(tiles, start, match, to) {
  const H = tiles.length, W = tiles[0].length; const seen = new Set(); const key=(x,y)=>x+","+y; const out=[]; const q=[start];
  while(q.length){ const {x,y}=q.pop(); if(x<0||y<0||x>=W||y>=H) continue; if(seen.has(key(x,y))) continue; seen.add(key(x,y)); if(tiles[y][x].biome!==match) continue; out.push({x,y,biome:to}); q.push({x:x+1,y}); q.push({x:x-1,y}); q.push({x,y:y+1}); q.push({x,y:y-1}); }
  return out;
}

function placePOI({ x, y, type }) {
  const poi = {
    id: crypto.randomUUID(), type, x, y,
    name: type.charAt(0).toUpperCase() + type.slice(1), icon: type, description: '', meta: {}
  };
  state.shard.pois.push(poi);
  undo.push({ label: 'Add POI', forward: { type: 'poiAdd', poi }, inverse: { type: 'poiDel', id: poi.id } });
  state.shardDirty = true;
  inspector.inspectPOI(poi, onInspectorApplyPOI);
  scheduleDraw();

  // Optimistic create via API; revert on failure
  const shardId = state.shard?.shard_id;
  if (shardId) {
    api.createPOI(shardId, poi).then(res => {
      const newId = res?.id || res?.poi_id || null;
      if (newId && newId !== poi.id) {
        // update local reference id
        const p = state.shard.pois.find(pp => pp.id === poi.id);
        if (p) p.id = String(newId);
      }
    }).catch(err => {
      console.error('createPOI failed', err);
      toast('Create POI failed; reverted');
      // revert local change
      state.shard.pois = state.shard.pois.filter(p => p.id !== poi.id);
      scheduleDraw();
    });
  }
}

function movePOI(poiId, to) {
  const poi = state.shard.pois.find(p => p.id === poiId);
  if (!poi) return;
  const before = { x: poi.x, y: poi.y };
  poi.x = to.x; poi.y = to.y;
  undo.push({ label: 'Move POI', forward: { type: 'poiMove', id: poiId, to }, inverse: { type: 'poiMove', id: poiId, to: before } });
  state.shardDirty = true;
  scheduleDraw();

  // Do not spam API on drag; defer to inspector apply for persistence of edits
}

function applyAction(op) {
  if (!op) return;
  switch (op.type) {
    case 'tiles':
      for (const c of op.changes) {
        const t = state.shard.tiles[c.y]?.[c.x];
        if (t) t.biome = c.biome;
      }
      break;
    case 'poiAdd':
      state.shard.pois.push(op.poi);
      break;
    case 'poiDel':
      state.shard.pois = state.shard.pois.filter(p => p.id !== op.id);
      break;
    case 'poiMove': {
      const p = state.shard.pois.find(pp => pp.id === op.id);
      if (p) { p.x = op.to.x; p.y = op.to.y; }
      break;
    }
    case 'poiUpdate': {
      const p = state.shard.pois.find(pp => pp.id === op.before.id);
      if (p) Object.assign(p, op.after);
      break;
    }
  }
  state.shardDirty = true;
  scheduleDraw();
}

function handleInspectorApply(payload) {
  if (payload.kind === 'tile') {
    const { x, y, tile } = payload;
    const t = state.shard.tiles[y]?.[x];
    if (!t) return;
    const before = { ...t };
    Object.assign(t, tile);
    const v = validateShard(state.shard); if (!v.ok) logError('Schema issues', v.errors);
    undo.push({ label: 'Edit tile', forward: { type: 'tiles', changes: [{ x, y, biome: t.biome }] }, inverse: { type: 'tiles', changes: [{ x, y, biome: before.biome }] } });
    scheduleDraw();
  } else if (payload.kind === 'poi') {
    const idx = state.shard.pois.findIndex(p => p.id === payload.poi.id);
    if (idx === -1) return;
    const before = structuredClone(state.shard.pois[idx]);
    state.shard.pois[idx] = payload.poi;
    const v = validateShard(state.shard); if (!v.ok) logError('Schema issues', v.errors);
    undo.push({ label: 'Edit POI', forward: { type: 'poiUpdate', before, after: payload.poi }, inverse: { type: 'poiUpdate', before: payload.poi, after: before } });
    scheduleDraw();

    // Optimistic update via API; revert on failure
    const shardId = state.shard?.shard_id;
    if (shardId) {
      api.updatePOI(shardId, payload.poi).catch(err => {
        console.error('updatePOI failed', err);
        toast('Update POI failed; reverted');
        // revert local change
        state.shard.pois[idx] = before;
        scheduleDraw();
      });
    }
  }
}

function onInspectorApplyPOI(poi) {
  // no-op placeholder for additional hooks
}

function handleInspectorDelete(poiId) {
  const p = state.shard.pois.find(pp => pp.id === poiId);
  if (!p) return;
  state.shard.pois = state.shard.pois.filter(pp => pp.id !== poiId);
  undo.push({ label: 'Delete POI', forward: { type: 'poiDel', id: poiId }, inverse: { type: 'poiAdd', poi: p } });
  scheduleDraw();

  // Optimistic delete via API; put back on failure
  const shardId = state.shard?.shard_id;
  if (shardId) {
    api.deletePOI(shardId, poiId).catch(err => {
      console.error('deletePOI failed', err);
      toast('Delete POI failed; restored');
      state.shard.pois.push(p); // restore
      scheduleDraw();
    });
  }
}

function handlePickTarget(cb) {
  toast('Pick a target tile (ESC to cancel)');
  tools.setPointerModeOnce('pickTarget', (x, y) => cb({ x, y }));
}

// Legacy context actions removed in favor of context menu event.

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); el.remove(); }, 2000);
}
function logError(msg, err) {
  console.error(msg, err);
  const p = document.createElement('pre');
  p.textContent = `[Error] ${msg}\n${(err && (err.stack || JSON.stringify(err, null, 2))) || ''}`;
  els.consolePanel.prepend(p);
}

function logTile(x, y, tile) {
  const p = document.createElement('pre');
  p.textContent = JSON.stringify({ x, y, biome: tile.biome, elevation: tile.elevation, tags: tile.tags, resources: tile.resources, flags: tile.flags }, null, 2);
  els.consolePanel.prepend(p);
}

// Dev bootstrap: load mock shard if none and devMode enabled
if (state.devMode && !state.shard) {
  fetch('/static/src/shardViewer/dev/mockShard.json').then(r => r.json()).then(loadShard).catch(()=>{});
}


// Allow external modules (e.g., context menu tier placement) to request redraw
document.addEventListener('editor:redraw', () => scheduleDraw());
