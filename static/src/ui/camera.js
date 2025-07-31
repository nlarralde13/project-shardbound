// camera.js
// Manages zoom and pan behavior for the shard canvas

// Configuration for zoom levels
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.0;
let currentZoom = 1.0;

/**
 * applyZoom
 * Applies CSS transform to the canvas to scale its content.
 * @param {number} zoomLevel - The new zoom level to apply.
 */
export function applyZoom(zoomLevel) {
  // Clamp zoom level between MIN_ZOOM and MAX_ZOOM
  currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));

  const canvas = document.getElementById('viewport');
  if (!canvas) return;

  // Apply scaling transform to canvas
  canvas.style.transform = `scale(${currentZoom})`;
  canvas.style.transformOrigin = 'top left';

  // Update the zoom display overlay
  updateZoomDisplay();
}

/**
 * getZoomLevel
 * Returns the current zoom level.
 * @returns {number}
 */
export function getZoomLevel() {
  return currentZoom;
}

/**
 * updateZoomDisplay
 * Updates the on-screen zoom percentage indicator.
 */
function updateZoomDisplay() {
  const zoomDisplay = document.getElementById('zoomDisplay');
  if (zoomDisplay) {
    const percent = Math.round(currentZoom * 100);
    zoomDisplay.textContent = `Zoom: ${percent}%`;
  }
}

/**
 * setupZoomControls
 * Attaches event listeners to zoom in/out buttons and mouse wheel.
 */
export function setupZoomControls() {
  const btnZoomIn = document.getElementById('zoomIn');
  const btnZoomOut = document.getElementById('zoomOut');
  const wrapper = document.getElementById('viewportWrapper');

  if (btnZoomIn) {
    // Button zoom in
    btnZoomIn.addEventListener('click', () => {
      applyZoom(currentZoom + ZOOM_STEP);
    });
  }

  if (btnZoomOut) {
    // Button zoom out
    btnZoomOut.addEventListener('click', () => {
      applyZoom(currentZoom - ZOOM_STEP);
    });
  }

  /*if (wrapper) {
    // Mouse wheel zoom (Ctrl + wheel or just wheel)
    wrapper.addEventListener('wheel', e => {
        const pivotX = e.offsetX;
        const pivotY = e.offsetY;
        
        const canvas = document.getElementById('viewport');
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        canvas.style.transformOrigin = `${pivotX}px ${pivotY}px`;
        applyZoom(currentZoom + delta);
    });
  } */
}

/**
 * initCamera
 * Initializes camera controls (pan, zoom display, etc.).
 * Call this once on application start (after DOM is loaded).
 */
export function initCamera() {
  // Ensure elements exist after DOM load
  setupZoomControls();

  // Initial display update
  updateZoomDisplay();
}

// Note: Pan (click-drag) can be added here in future as needed
