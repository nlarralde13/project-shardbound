// camera.js
// Enhanced camera with zoom + directional pan + compass UI
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.0;
let currentZoom = 1.0;

let cameraX = 0;
let cameraY = 0;

let ctxRef, canvasRef, wrapperRef, shardRef, originX, originY, redrawFn;

export function initCamera({ canvas, wrapper, ctx, shardData, originX: oX, originY: oY, getState, setState }) {
  ctxRef = ctx;
  canvasRef = canvas;
  wrapperRef = wrapper;
  shardRef = shardData;
  originX = oX;
  originY = oY;

  setupZoomControls();
  createCompassUI();
  updateZoomDisplay();
}

function createCompassUI() {
  const compass = document.createElement('div');
  compass.id = 'compassUI';
  compass.innerHTML = `
    <div class="compass-btn" data-dir="N">N</div>
    <div class="compass-btn" data-dir="E">E</div>
    <div class="compass-btn" data-dir="S">S</div>
    <div class="compass-btn" data-dir="W">W</div>
  `;
  Object.assign(compass.style, {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 20,
    fontFamily: '"IM Fell English SC", serif',
    fontSize: '20px',
    background: 'rgba(0,0,0,0.5)',
    padding: '10px',
    borderRadius: '8px',
    color: '#ffe',
    textAlign: 'center'
  });
  document.body.appendChild(compass);

  compass.querySelectorAll('.compass-btn').forEach(btn => {
    Object.assign(btn.style, {
      cursor: 'pointer',
      padding: '4px 8px',
      margin: '2px',
      border: '1px solid #999',
      borderRadius: '4px'
    });
    btn.onclick = () => {
      const dir = btn.dataset.dir;
      if (dir === 'N') moveCameraBy(0, -1);
      if (dir === 'S') moveCameraBy(0, 1);
      if (dir === 'E') moveCameraBy(1, 0);
      if (dir === 'W') moveCameraBy(-1, 0);
    };
  });

  // Google Fonts preload
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&display=swap';
  document.head.appendChild(link);
}

export function moveCameraBy(dx, dy) {
  cameraX = Math.max(0, Math.min(shardRef.width - 1, cameraX + dx));
  cameraY = Math.max(0, Math.min(shardRef.height - 1, cameraY + dy));
  redrawFn?.();
}

export function centerCameraOn(tileX, tileY) {
  cameraX = tileX;
  cameraY = tileY;
  redrawFn?.();
}

export function setRedrawFn(fn) {
  redrawFn = fn;
}

export function getCameraOffset() {
  return { x: cameraX, y: cameraY };
}

export function applyZoom(newZoom, centerX = originX, centerY = originY) {
  currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  if (canvasRef) {
    canvasRef.style.width = canvasRef.width + 'px';
    canvasRef.style.height = canvasRef.height + 'px';
    canvasRef.style.transform = `scale(${currentZoom})`;
    canvasRef.style.transformOrigin = 'top left';
  }

  if (wrapperRef) {
    const scrollX = (centerX * currentZoom) - (wrapperRef.clientWidth / 2);
    const scrollY = (centerY * currentZoom) - (wrapperRef.clientHeight / 2);
    wrapperRef.scrollLeft = scrollX;
    wrapperRef.scrollTop = scrollY;
  }

  updateZoomDisplay();
  redrawFn?.();
}

function updateZoomDisplay() {
  const zoomDisplay = document.getElementById('zoomDisplay');
  if (zoomDisplay) {
    zoomDisplay.textContent = `Zoom: ${Math.round(currentZoom * 100)}%`;
  }
}

export function getZoomLevel() {
  return currentZoom;
}

export function screenToWorld(e, canvas, wrapper) {
  const rect = canvas.getBoundingClientRect();
  const scale = currentZoom;
  const x = (e.clientX - rect.left) / scale + wrapper.scrollLeft;
  const y = (e.clientY - rect.top ) / scale + wrapper.scrollTop;
  return { x, y };
}

export function setupZoomControls() {
  const btnZoomIn = document.getElementById('zoomIn');
  const btnZoomOut = document.getElementById('zoomOut');
  const TILE_HEIGHT = 50;
  const TILE_WIDTH = 50;

  function getPlayerScreenCoords() {
    if (!shardRef || !originX || !originY) return { x: originX, y: originY };

    const player = window.getPlayerPosition?.() || { x: shardRef.width / 2, y: shardRef.height / 2 };

    const screenX = originX + (player.x - player.y) * (TILE_WIDTH / 2);
    const screenY = originY + (player.x + player.y) * (TILE_HEIGHT / 2);

    return { x: screenX, y: screenY };
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      const { x, y } = getPlayerScreenCoords();
      applyZoom(currentZoom + ZOOM_STEP, x, y);
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      const { x, y } = getPlayerScreenCoords();
      applyZoom(currentZoom - ZOOM_STEP, x, y);
    });
  }
}


