// Zoom controller with flexible IDs and safe re-render callback.

let zoomLevel = 1;
let redrawFn = null;
let canvasRef = null;
let shardRef = null;
let overlayEl = null;
let wrapperRef = null;

// Public
export function getZoomLevel() {
  return zoomLevel;
}

export function setRedrawFn(fn) {
  redrawFn = typeof fn === 'function' ? fn : null;
}

function updateOverlay() {
  if (overlayEl) overlayEl.textContent = `${Math.round(zoomLevel * 100)}%`;
}

function applyZoom(nextZoom, centerX, centerY) {
  // Clamp: 0.3x .. 2.0x (tweak if needed)
  zoomLevel = Math.max(0.3, Math.min(2.0, nextZoom));

  const ctx = canvasRef?.getContext?.('2d');
  if (!ctx) return;

  // Re-center around provided point if possible
  // (no transform persistence here; your renderer should draw with scale)
  // We simply re-render; your render function should read getZoomLevel()
  if (typeof redrawFn === 'function') {
    redrawFn(ctx, shardRef);
  }
  updateOverlay();

  // Optional: if you keep the map inside a scrollable wrapper, try to keep center in view
  if (wrapperRef && typeof centerX === 'number' && typeof centerY === 'number') {
    const cx = Math.max(0, centerX - wrapperRef.clientWidth / 2);
    const cy = Math.max(0, centerY - wrapperRef.clientHeight / 2);
    wrapperRef.scrollTo({ left: cx, top: cy, behavior: 'auto' });
  }
}

/**
 * Wire zoom buttons + overlay.
 * Accepts both "Btn/Overlay" IDs and fallback IDs to match different HTMLs.
 */
export function setupZoomControls({
  canvas,
  wrapper = document.getElementById('viewportWrapper'),
  shard,
  originX,
  originY,
  renderFn,
  overlayId = 'zoomOverlay',
  btnInId = 'zoomInBtn',
  btnOutId = 'zoomOutBtn',
  // fallbacks for older markup
  fallbackOverlayId = 'zoomDisplay',
  fallbackBtnInId = 'zoomIn',
  fallbackBtnOutId = 'zoomOut'
} = {}) {
  canvasRef = canvas ?? canvasRef;
  wrapperRef = wrapper ?? wrapperRef;
  shardRef = shard ?? shardRef;
  if (renderFn) setRedrawFn((ctxArg, shardArg) => renderFn(ctxArg, shardArg));

  // Resolve elements with primary IDs, then fallback IDs
  overlayEl = document.getElementById(overlayId) || document.getElementById(fallbackOverlayId);
  const btnZoomIn =
    document.getElementById(btnInId) || document.getElementById(fallbackBtnInId);
  const btnZoomOut =
    document.getElementById(btnOutId) || document.getElementById(fallbackBtnOutId);

  // Derive an approximate screen center in canvas space for better zoom centering
  const getCenter = () => {
    const rect = canvasRef.getBoundingClientRect();
    return {
      x: rect.width / 2,
      y: rect.height / 2
    };
  };

  btnZoomIn?.addEventListener('click', () => {
    const c = getCenter();
    applyZoom(zoomLevel + 0.1, c.x, c.y);
  });

  btnZoomOut?.addEventListener('click', () => {
    const c = getCenter();
    applyZoom(zoomLevel - 0.1, c.x, c.y);
  });

  updateOverlay();
}
