// ui/mapView.js
// A self-contained map "actor": mount → (pause/resume) → unmount.
// Owns the canvas, hover/select, fit/origin, zoom hookup, and drag-pan.

import { renderShard } from '../shards/renderShard.js';
import {
  fitIsoTransform,
  computeIsoOrigin,
  getTileUnderMouseIso,
  updateDevStatsPanel
} from '../utils/mapUtils.js';
import { setupZoomControls, getZoomLevel } from './camera.js';

const TILE_WIDTH = 32;   // align with your config
const TILE_HEIGHT = 16;

let wrapper, canvas, ctx;
let shard = null;

// ✅ Keep a single, long-lived origin object (don’t replace the reference)
let origin = { originX: 0, originY: 0 };

let hoverTile = null;
let selectedTile = null;

let mounted = false;
let ready = false;
let paused = true;

// — event bookkeeping —
let handlers = [];
const add = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); handlers.push([el, type, fn, opts]); };
const removeAll = () => { for (const [el, type, fn, opts] of handlers) el.removeEventListener(type, fn, opts); handlers = []; };

// 🖱️ drag-pan state
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartOriginX = 0, dragStartOriginY = 0;
let dragMoved = 0;

// Pointer-driven drag that mutates `origin` in place
function wireDragPan() {
  const onDown = (e) => {
    if (paused) return;
    isDragging = true;
    dragMoved = 0;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartOriginX = origin.originX;
    dragStartOriginY = origin.originY;
    canvas.classList.add('grabbing');
    canvas.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e) => {
    if (!isDragging || paused) return;
    const scale = (typeof getZoomLevel === 'function' ? getZoomLevel() : 1) || 1;
    const dx = (e.clientX - dragStartX) / scale;
    const dy = (e.clientY - dragStartY) / scale;

    origin.originX = dragStartOriginX + dx;
    origin.originY = dragStartOriginY + dy;

    dragMoved = Math.max(dragMoved, Math.abs(dx) + Math.abs(dy));
    redraw();
  };

  const onUp = (e) => {
    isDragging = false;
    canvas.classList.remove('grabbing');
    canvas.releasePointerCapture?.(e.pointerId);
  };

  // Prevent “click” selecting a tile right after a drag
  const suppressClickIfDragged = (e) => {
    if (dragMoved > 4) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  add(canvas, 'pointerdown', onDown);
  add(canvas, 'pointermove', onMove);
  add(canvas, 'pointerup', onUp);
  add(canvas, 'pointercancel', onUp);
  add(canvas, 'click', suppressClickIfDragged, true); // capture phase to pre-empt tile click
}

function shimZoomIdsForCamera() {
  // camera.js expects #zoomIn / #zoomOut / #zoomDisplay
  const inBtn = document.getElementById('zoomInBtn');
  const outBtn = document.getElementById('zoomOutBtn');
  const overlay = document.getElementById('zoomOverlay');
  if (inBtn && !document.getElementById('zoomIn')) inBtn.id = 'zoomIn';
  if (outBtn && !document.getElementById('zoomOut')) outBtn.id = 'zoomOut';
  if (overlay && !document.getElementById('zoomDisplay')) overlay.id = 'zoomDisplay';
}

async function loadDefaultShard() {
  if (shard) return shard;
  const url = '/static/public/shards/shard_0_0.json';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  shard = await res.json();
  return shard;
}

function fitCanvas() {
  if (!wrapper || !canvas || !shard) return;
  const fit = fitIsoTransform(
    wrapper.clientWidth, wrapper.clientHeight,
    shard.width, shard.height,
    TILE_WIDTH, TILE_HEIGHT
  );
  canvas.width  = Math.ceil(fit.mapW || wrapper.clientWidth);
  canvas.height = Math.ceil(fit.mapH || wrapper.clientHeight);

  // ✅ Don’t replace `origin`; mutate it so all readers keep the same reference
  const o = computeIsoOrigin(canvas.width, canvas.height);
  origin.originX = o.originX;
  origin.originY = o.originY;
}

function redraw() {
  if (!ctx || !shard) return;
  renderShard(ctx, shard, { hoverTile, selectedTile, origin });
}

function wireInteractions() {
  add(canvas, 'mousemove', (e) => {
    if (paused || !shard || isDragging) return; // ignore hover while dragging
    const rect = canvas.getBoundingClientRect();
    const t = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shard,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );
    if (t?.x !== hoverTile?.x || t?.y !== hoverTile?.y) {
      hoverTile = t || null;
      redraw();
    }
  });

  add(canvas, 'click', (e) => {
    if (paused || !shard) return;
    if (dragMoved > 4) return; // already suppressed in capture, belt & suspenders
    const rect = canvas.getBoundingClientRect();
    const t = getTileUnderMouseIso(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas,
      shard,
      origin,
      TILE_WIDTH,
      TILE_HEIGHT
    );
    if (!t) return;
    selectedTile = t;
    updateDevStatsPanel(t);
    redraw();

    // Force-open info panel idempotently
    const p = document.getElementById('infoPanel');
    if (p) {
      p.style.display = 'block';
      const icon = document.querySelector('button.panel-toggle[data-target="infoPanel"] .toggle-icon');
      if (icon) icon.textContent = '–';
    }
  });
}

/** Public API **/
export async function mountMap(rootSelector = '#mapViewer', { autoload = true } = {}) {
  if (mounted) { showMap(); return; }

  const host = document.querySelector(rootSelector);
  if (!host) throw new Error('[mapView] host not found');

  wrapper = document.getElementById('viewportWrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'viewportWrapper';
    // tip: your CSS can set display:flex here; JS just toggles block/none
    host.appendChild(wrapper);
  }

  canvas = document.getElementById('viewport');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'viewport';
    wrapper.appendChild(canvas);
  }
  ctx = canvas.getContext('2d');

  // Make visible before measuring to get accurate client sizes
  showMap();

  if (autoload && !shard) {
    await loadDefaultShard();
  }

  fitCanvas();
  redraw();

  // Zoom controls
  shimZoomIdsForCamera();
  setupZoomControls();
  console.log('[mapView] zoom @', Math.round((getZoomLevel?.() || 1) * 100) + '%');

  // Inputs
  wireInteractions();
  wireDragPan();           // 🆕 grab-to-pan

  mounted = true;
  ready = !!shard;
  paused = false;
}

export function unmountMap() {
  if (!mounted) return;
  removeAll();
  canvas?.remove();
  wrapper = canvas = ctx = null;
  mounted = false;
  ready = false;
  paused = true;
}

export function pauseMap() {
  if (!mounted) return;
  paused = true;
  removeAll();
}

export function resumeMap() {
  if (!mounted) return;
  if (!paused) return;
  paused = false;
  wireInteractions();
  wireDragPan();
  redraw();
}

export function showMap() { if (wrapper) wrapper.style.display = 'block'; }
export function hideMap() { if (wrapper) wrapper.style.display = 'none'; }

export function isMapMounted() { return mounted; }
export function isMapReady() { return ready; }

export function getShard() { return shard; }
export function setShard(newShard) { shard = newShard; fitCanvas(); redraw(); }
export function refitAndRedraw() { fitCanvas(); redraw(); }

export function getSelectedTile() { return selectedTile; }
export function getHoverTile() { return hoverTile; }
export function getOrigin() { return origin; }
export function forceRedraw() { redraw(); }
