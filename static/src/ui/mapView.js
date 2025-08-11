// ui/mapView.js
// A self-contained map "actor": mount → (pause/resume) → unmount.
// Owns the canvas, hover/select, fit/origin, and zoom hookup.

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
let origin = { originX: 0, originY: 0 };

let hoverTile = null;
let selectedTile = null;

let mounted = false;
let ready = false;
let paused = true;

let handlers = [];
const add = (el, type, fn) => { el.addEventListener(type, fn); handlers.push([el, type, fn]); };
const removeAll = () => { for (const [el, type, fn] of handlers) el.removeEventListener(type, fn); handlers = []; };

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
  origin = computeIsoOrigin(canvas.width, canvas.height);
}

function redraw() {
  if (!ctx || !shard) return;
  renderShard(ctx, shard, { hoverTile, selectedTile, origin });
}

function wireInteractions() {
  add(canvas, 'mousemove', (e) => {
    if (paused || !shard) return;
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

  // Hook zoom controls (shim IDs to what camera.js expects)
  shimZoomIdsForCamera();
  setupZoomControls();            // reads #zoomIn/#zoomOut/#zoomDisplay
  console.log('[mapView] zoom @', Math.round((getZoomLevel?.() || 1) * 100) + '%');

  wireInteractions();

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
