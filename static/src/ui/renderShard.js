// Renders a 16×16 shard centered on a black backdrop using two canvases:
// baseCanvas for terrain, overlayCanvas for grid/selection/hover.
import { TILE_WIDTH, TILE_HEIGHT, SHARD_COLS, SHARD_ROWS, BACKDROP_COLOR } from '../config/mapConfig.js';
import { getBiomeColor } from '../utils/colorUtils.js';
import { Camera } from './camera.js';
import { drawGrid, drawSelection, drawHover } from './mapOverlay.js';

function createCanvas(className) {
  const c = document.createElement('canvas');
  c.className = className;
  c.style.position = 'absolute';
  c.style.inset = '0';
  c.style.imageRendering = 'pixelated';
  return c;
}

function ensureHiDPI(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (!cssW || !cssH) return; // container not laid out yet
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
}

function isDevMode() {
  return new URLSearchParams(location.search).get('devMode') === '1';
}

export function initShardRenderer({
  container,
  shardData,              // { worldSeed, tiles: [{x,y,biome}, ...] } or tiles[rows][cols]
  onTileClick = () => {},
  overlay = { grid: true },
}) {
  // Wrapper: position:relative to stack canvases
  container.style.position = 'relative';
  container.style.background = BACKDROP_COLOR;
  container.style.overflow = 'hidden';

  const baseCanvas = createCanvas('sb-base');
  const overlayCanvas = createCanvas('sb-overlay');

  // canvases must be sized by CSS to fill container
  baseCanvas.style.width = '100%';
  baseCanvas.style.height = '100%';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';

  container.appendChild(baseCanvas);
  container.appendChild(overlayCanvas);

  ensureHiDPI(baseCanvas);
  ensureHiDPI(overlayCanvas);

  const baseCtx = baseCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  const shardPixelW = SHARD_COLS * TILE_WIDTH;
  const shardPixelH = SHARD_ROWS * TILE_HEIGHT;

  const camera = new Camera(overlayCanvas, shardPixelW, shardPixelH);

  let hover = { x: -1, y: -1 };
  let selected = { x: -1, y: -1 };
  let overlayFlags = { grid: !!overlay.grid };

  function getTileAt(worldX, worldY) {
    const x = Math.floor(worldX / TILE_WIDTH);
    const y = Math.floor(worldY / TILE_HEIGHT);
    if (x < 0 || x >= SHARD_COLS || y < 0 || y >= SHARD_ROWS) return { x: -1, y: -1 };
    return { x, y };
  }

  function screenToTile(evt) {
    const { worldX, worldY } = camera.screenToWorld(evt.clientX, evt.clientY);
    return getTileAt(worldX, worldY);
  }

  function drawBase() {
    // clear to black
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.fillStyle = BACKDROP_COLOR;
    baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);

    camera.apply(baseCtx);

    // Draw tiles
    // Accept either flat array of {x,y,biome} or a 2D array [row][col]
    for (let y = 0; y < SHARD_ROWS; y++) {
      for (let x = 0; x < SHARD_COLS; x++) {
        const cell = Array.isArray(shardData.tiles[0])
          ? shardData.tiles[y][x]
          : shardData.tiles.find(t => t.x === x && t.y === y);

        const biome = cell?.biome ?? 'ocean';
        baseCtx.fillStyle = getBiomeColor(biome);
        baseCtx.fillRect(x * TILE_WIDTH, y * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
      }
    }
  }

  function drawOverlays() {
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    camera.apply(overlayCtx);
    if (overlayFlags.grid) {
      drawGrid(overlayCtx, { cols: SHARD_COLS, rows: SHARD_ROWS, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
    }
    drawSelection(overlayCtx, { ...selected, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
    drawHover(overlayCtx, { ...hover, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
  }

  function fullRedraw() {
    ensureHiDPI(baseCanvas);
    ensureHiDPI(overlayCanvas);
    camera._recalc();
    drawBase();
    drawOverlays();
  }

  // Events
  const onResize = () => fullRedraw();
  window.addEventListener('resize', onResize);

  overlayCanvas.addEventListener('mousemove', (e) => {
    hover = screenToTile(e);
    drawOverlays();
  });

  overlayCanvas.addEventListener('mouseleave', () => {
    hover = { x: -1, y: -1 };
    drawOverlays();
  });

  overlayCanvas.addEventListener('click', (e) => {
    selected = screenToTile(e);
    if (selected.x >= 0) {
      const cell = Array.isArray(shardData.tiles[0])
        ? shardData.tiles[selected.y][selected.x]
        : shardData.tiles.find(t => t.x === selected.x && t.y === selected.y);

      onTileClick({ ...selected, biome: cell?.biome ?? 'ocean' });
    }
    drawOverlays();
  });

  // Zoom controls with +/- keys
  function onKeyDown(e) {
    if (e.key === '+' || e.key === '=') {
      camera.zoomIn();
      fullRedraw();
    } else if (e.key === '-' || e.key === '_') {
      camera.zoomOut();
      fullRedraw();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // Initial draw
  fullRedraw();

  return {
    updateShard(newShard) {
      shardData = newShard;
      fullRedraw();
    },
    setOverlayFlags(flags) {
      overlayFlags = { ...overlayFlags, ...flags };
      drawOverlays();
    },
    screenToTile, // exposed for tooltip
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      container.removeChild(baseCanvas);
      container.removeChild(overlayCanvas);
    },
    get camera() { return camera; },
    isDevMode,
  };
}
