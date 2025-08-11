// ui/mapView.js
// Map canvas + view context manager (shard | slice | room)

import { renderShard } from '../shards/renderShard.js';
import { TILE_WIDTH, TILE_HEIGHT } from '../config/mapConfig.js';
import { getTileUnderMouseIso, updateDevStatsPanel } from '../utils/mapUtils.js';
import { getZoomLevel, setupZoomControls, bindCameraTargets } from '../ui/camera.js';

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
};
const L = (...a) => console.log(`[${now()}][mapView]`, ...a);

/* ──────────────────────────────
 * Module state
 * ────────────────────────────── */
let wrapper = null;        // #viewportWrapper
let canvas  = null;        // #viewport
let ctx     = null;

let rootShard = null;      // always the 50×50 region shard
let current   = null;      // { type: 'shard'|'slice'|'room', sid, data }

let hoverTile    = null;
let selectedTile = null;

let paused  = false;
let mounted = false;

// Internal drag-to-pan (pre-zoom screen px)
let pan = { x: 0, y: 0 };
let dragging = false;
let dragStart = { x: 0, y: 0 };

const origin = { originX: 0, originY: 0 };

/* ──────────────────────────────
 * Helpers
 * ────────────────────────────── */

function fitCanvas() {
  if (!wrapper || !canvas) return;

  canvas.width  = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;

  const data = current?.data;
  if (data?.width && data?.height) {
    const mapH = (data.width + data.height) * (TILE_HEIGHT / 2);
    origin.originX = canvas.width / 2;
    origin.originY = Math.max(0, (canvas.height - mapH) / 2);
  } else {
    origin.originX = canvas.width / 2;
    origin.originY = 40;
  }
}

function redraw() {
  if (!ctx || !canvas || !current?.data) return;

  // Clear to identity; DO NOT scale canvas here (CSS transform handles zoom)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply pan to origin for drawing
  const drawOrigin = {
    originX: origin.originX + pan.x,
    originY: origin.originY + pan.y
  };

  renderShard(ctx, current.data, { hoverTile, selectedTile, origin: drawOrigin });
}

function logHit(label, { e, rect, drawOrigin, zoom, tile }) {
  console.log('[hit]', label, {
    zoom,
    mouse: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    origin: drawOrigin,
    pan,
    canvas: { w: canvas?.width, h: canvas?.height },
    tile
  });
}

export function refitAndRedraw() {
  requestAnimationFrame(() => {
    fitCanvas();
    redraw();
  });
}

/* ──────────────────────────────
 * Visibility / lifecycle
 * ────────────────────────────── */

export function showMap() {
  const w = wrapper || document.getElementById('viewportWrapper');
  if (w) w.style.display = 'flex';
}
export function hideMap() {
  const w = wrapper || document.getElementById('viewportWrapper');
  if (w) w.style.display = 'none';
}
export function pauseMap()  { paused = true;  }
export function resumeMap() { paused = false; }

export function isMapMounted() { return mounted; }
export function isMapReady()   { return !!(current && current.data && ctx); }

/* ──────────────────────────────
 * Context (root shard vs current)
 * ────────────────────────────── */

export function setShard(s) {
  rootShard = s;
  if (!current || current.type === 'shard') {
    current = { type: 'shard', sid: s.id || 's0_0', data: s };
  }
  refitAndRedraw();
}
export function getShard()   { return rootShard; }
export function getContext() { return current ? { ...current } : null; }

export function swapContext({ type, sid, data, keepCamera = false }) {
  if (type === 'shard' && data) rootShard = data;

  // Normalize room: always a 1×1 shard-like grid so render/pick are uniform
  if (type === 'room' && data && !data.tiles) {
    data = {
      id: data.id || `room:${sid}`,
      type: 'room',
      width: 1,
      height: 1,
      tiles: [[ { ...data, kind: data.kind || 'room' } ]]
    };
  }

  current = { type, sid, data };
  if (!keepCamera) { hoverTile = null; selectedTile = null; }
  // New view starts centered (no carry-over pan)
  pan.x = 0; pan.y = 0;

  redraw();
}

/* ──────────────────────────────
 * Input (drag pan + pick)
 * ────────────────────────────── */

function onMouseDown(e) {
  if (!canvas) return;
  dragging = true;
  canvas.style.cursor = 'grabbing';
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
}

function endDrag() {
  dragging = false;
  if (canvas) canvas.style.cursor = 'grab';
}

function onMouseMove(e) {
  if (paused || !canvas || !current?.data) return;

  // drag-to-pan
  if (dragging) {
    const z = (getZoomLevel?.() || 1);
    pan.x += (e.clientX - dragStart.x) / z;
    pan.y += (e.clientY - dragStart.y) / z;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    redraw();
    return;
  }

  // hover tile
  const rect = canvas.getBoundingClientRect();
  const drawOrigin = { originX: origin.originX + pan.x, originY: origin.originY + pan.y };
  const tile = getTileUnderMouseIso(
    e.clientX - rect.left,
    e.clientY - rect.top,
    canvas,
    current.data,
    drawOrigin,
    TILE_WIDTH,
    TILE_HEIGHT
  );
  if (tile?.x !== hoverTile?.x || tile?.y !== hoverTile?.y) {
    hoverTile = tile || null;
    logHit('move', { e, rect, drawOrigin, zoom: getZoomLevel?.(), tile });
    redraw();
  }
}

function onClick(e) {
  if (paused || !canvas || !current?.data) return;

  const rect = canvas.getBoundingClientRect();
  const drawOrigin = { originX: origin.originX + pan.x, originY: origin.originY + pan.y };
  const tile = getTileUnderMouseIso(
    e.clientX - rect.left,
    e.clientY - rect.top,
    canvas,
    current.data,
    drawOrigin,
    TILE_WIDTH,
    TILE_HEIGHT
  );
  if (!tile) return;

  selectedTile = tile;
  window.__lastSelectedTile = tile; // dev/HUD hook

  // Update the info panel
  updateDevStatsPanel(selectedTile);

  logHit('click', { e, rect, drawOrigin, zoom: getZoomLevel?.(), tile });
  redraw();
}

export function getSelectedTile() {
  return selectedTile ? { ...selectedTile } : null;
}

/* ──────────────────────────────
 * Mount
 * ────────────────────────────── */

export async function mountMap(viewerSel = '#mapViewer', opts = { autoload: true }) {
  if (mounted && ctx) { refitAndRedraw(); return; }

  const viewer = document.querySelector(viewerSel);
  if (!viewer) throw new Error('[mapView] mountMap: viewer not found');

  wrapper = viewer.querySelector('#viewportWrapper') || viewer;
  canvas  = viewer.querySelector('#viewport');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'viewport';
    wrapper.appendChild(canvas);
  }
  ctx = canvas.getContext('2d', { alpha: false });

  // ensure wrapper visible before measuring
  showMap();
  await new Promise(r => requestAnimationFrame(r));

  // autoload shard if needed
  if (opts?.autoload && !rootShard) {
    const s = await fetch('/static/public/shards/shard_0_0.json').then(r => r.json());
    rootShard = s;
    current   = { type: 'shard', sid: s.id || 's0_0', data: s };
  }

  fitCanvas();
  redraw();

  // input
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', endDrag);
  canvas.addEventListener('mouseleave', endDrag);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  canvas.style.cursor = 'grab';

  // Wheel zoom / any extra camera bindings you provide.
  // Keep optional to avoid conflicts if not exported.
  bindCameraTargets?.({ canvas, wrapper, onChange: () => redraw() });
  setupZoomControls?.({ canvas, renderFn: () => redraw() });

  L(`zoom @ ${Math.round((getZoomLevel?.() || 1) * 100)}%`);
  mounted = true;
}

export default {
  // lifecycle
  mountMap, isMapMounted, isMapReady, showMap, hideMap, pauseMap, resumeMap, refitAndRedraw,
  // context
  getShard, setShard, getContext, swapContext, getSelectedTile
};
