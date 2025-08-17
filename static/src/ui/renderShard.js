import { TILE_WIDTH, TILE_HEIGHT, SHARD_COLS, SHARD_ROWS, BACKDROP_COLOR } from '../config/mapConfig.js';
import { getBiomeColor, uiColors } from '../utils/colorUtils.js';
import { Camera } from './camera.js';
import { drawGrid, drawSelection, drawHover } from './mapOverlay.js';

import { TravelConfig } from '../config/travelConfig.js';
import {
  getPlayerPosition, setPlayerPosition,
  getStamina, getMaxStamina, changeStamina,
} from '../state/playerState.js';

// ---------- dual logger (on-screen console + DevTools) ----------
function logBoth(tag, msg) {
  const line = `[${tag}] ${msg}`;
  // DevTools
  console.log(line);
  // On-screen console
  const pane = document.getElementById('console');
  if (pane) {
    const div = document.createElement('div');
    div.textContent = line;
    pane.appendChild(div);
    pane.scrollTop = pane.scrollHeight;
  }
}

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
  if (!cssW || !cssH) return;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
}
function isDevMode() {
  return new URLSearchParams(location.search).get('devMode') === '1';
}
function isOcean(cell) { return (cell?.biome ?? 'ocean') === 'ocean'; }

export function initShardRenderer({
  container,
  shardData,              // { tiles: 2D [y][x] of { biome, ... }, pois?:[], spawn? }
  onTileClick = () => {},
  overlay = { grid: true },
  player = { spriteLand: null, spriteWater: null },
}) {
  container.style.position = 'relative';
  container.style.background = BACKDROP_COLOR;
  container.style.overflow = 'hidden';

  const baseCanvas = createCanvas('sb-base');
  const overlayCanvas = createCanvas('sb-overlay');

  baseCanvas.style.width = overlayCanvas.style.width = '100%';
  baseCanvas.style.height = overlayCanvas.style.height = '100%';

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

  const spriteRefs = { spriteLand: player.spriteLand, spriteWater: player.spriteWater };

  function getCell(x, y) {
    if (y < 0 || y >= SHARD_ROWS || x < 0 || x >= SHARD_COLS) return null;
    return Array.isArray(shardData.tiles[0]) ? shardData.tiles[y][x]
      : shardData.tiles.find(t => t.x === x && t.y === y);
  }

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
    // clear backdrop
    baseCtx.setTransform(1,0,0,1,0,0);
    baseCtx.fillStyle = BACKDROP_COLOR;
    baseCtx.fillRect(0,0,baseCanvas.width,baseCanvas.height);

    camera.apply(baseCtx);

    // terrain
    for (let y = 0; y < SHARD_ROWS; y++) {
      for (let x = 0; x < SHARD_COLS; x++) {
        const cell = getCell(x,y) || { biome: 'ocean' };
        baseCtx.fillStyle = getBiomeColor(cell.biome);
        baseCtx.fillRect(x*TILE_WIDTH, y*TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
      }
    }

    // coast overlay on land edges next to ocean
    const s = Math.max(2, Math.floor(TILE_WIDTH * 0.18));
    baseCtx.fillStyle = getBiomeColor('beach');
    for (let y = 0; y < SHARD_ROWS; y++) {
      for (let x = 0; x < SHARD_COLS; x++) {
        const c = getCell(x,y);
        if (!c || isOcean(c)) continue;
        const px = x*TILE_WIDTH, py = y*TILE_HEIGHT;
        if (isOcean(getCell(x, y-1))) baseCtx.fillRect(px, py, TILE_WIDTH, s);
        if (isOcean(getCell(x+1, y))) baseCtx.fillRect(px+TILE_WIDTH-s, py, s, TILE_HEIGHT);
        if (isOcean(getCell(x, y+1))) baseCtx.fillRect(px, py+TILE_HEIGHT-s, TILE_WIDTH, s);
        if (isOcean(getCell(x-1, y))) baseCtx.fillRect(px, py, s, TILE_HEIGHT);
      }
    }

    // POIs
    const pois = shardData.pois || [];
    for (const poi of pois) {
      const { x, y, type } = poi;
      const cx = x*TILE_WIDTH + TILE_WIDTH/2;
      const cy = y*TILE_HEIGHT + TILE_HEIGHT/2;
      baseCtx.beginPath();
      baseCtx.fillStyle = type === 'port' ? uiColors.poiPort : uiColors.poiTown;
      baseCtx.arc(cx, cy, Math.floor(TILE_WIDTH*0.25), 0, Math.PI*2);
      baseCtx.fill();
      baseCtx.lineWidth = 2;
      baseCtx.strokeStyle = '#0b0e13';
      baseCtx.stroke();
    }
  }

  function drawPlayer() {
    const pos = getPlayerPosition();
    overlayCtx.save();
    camera.apply(overlayCtx);

    const cell = getCell(pos.x, pos.y);
    const onWater = isOcean(cell);
    const img = onWater ? spriteRefs.spriteWater : spriteRefs.spriteLand;

    const px = pos.x*TILE_WIDTH + TILE_WIDTH/2;
    const py = pos.y*TILE_HEIGHT + TILE_HEIGHT/2;

    if (img && img.complete) {
      const scale = Math.min(TILE_WIDTH, TILE_HEIGHT) / Math.max(img.width, img.height) * 0.9;
      const w = img.width * scale;
      const h = img.height * scale;
      overlayCtx.drawImage(img, px - w/2, py - h/2, w, h);
    } else {
      overlayCtx.fillStyle = '#ffffff';
      overlayCtx.globalAlpha = 0.9;
      overlayCtx.beginPath();
      overlayCtx.moveTo(px, py - TILE_HEIGHT*0.3);
      overlayCtx.lineTo(px + TILE_WIDTH*0.25, py);
      overlayCtx.lineTo(px, py + TILE_HEIGHT*0.3);
      overlayCtx.lineTo(px - TILE_WIDTH*0.25, py);
      overlayCtx.closePath();
      overlayCtx.fill();
    }

    overlayCtx.restore();
  }

  function drawOverlays() {
    overlayCtx.setTransform(1,0,0,1,0,0);
    overlayCtx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    camera.apply(overlayCtx);
    if (overlayFlags.grid) {
      drawGrid(overlayCtx, { cols: SHARD_COLS, rows: SHARD_ROWS, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
    }
    drawSelection(overlayCtx, { ...selected, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
    drawHover(overlayCtx, { ...hover, tileW: TILE_WIDTH, tileH: TILE_HEIGHT });
    drawPlayer();
  }

  function fullRedraw() {
    ensureHiDPI(baseCanvas);
    ensureHiDPI(overlayCanvas);
    camera._recalc();
    drawBase();
    drawOverlays();
  }

  // --------- Movement (A/B) with detailed logging ----------
  function tryMoveCardinal(dir) {
    const DIRS = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
    const delta = DIRS[dir]; 
    if (!delta) { logBoth('move', `reject BAD_DIR "${dir}"`); return { ok:false, reason:'BAD_DIR' }; }

    const pos = getPlayerPosition();
    const [dx, dy] = delta;
    const target = { x: pos.x + dx, y: pos.y + dy };

    logBoth('move', `intent ${dir}: from (${pos.x},${pos.y}) → (${target.x},${target.y})`);

    // Clamp to bounds
    const nx = Math.min(Math.max(target.x, 0), SHARD_COLS-1);
    const ny = Math.min(Math.max(target.y, 0), SHARD_ROWS-1);
    if (nx !== target.x || ny !== target.y) {
      logBoth('move', `clamped to bounds: (${nx},${ny})`);
    }
    if (nx === pos.x && ny === pos.y) {
      logBoth('move', `blocked OUT_OF_BOUNDS (no tile change)`);
      return { ok:false, reason:'OUT_OF_BOUNDS' };
    }

    const cost = (TravelConfig?.STAMINA?.COST_TRAVEL ?? 1);
    const before = getStamina();
    logBoth('stamina', `before=${before}, cost=${cost}, max=${getMaxStamina()}`);

    if (before < cost) {
      logBoth('stamina', `NO_STAMINA: need ${cost}, have ${before}`);
      return { ok:false, reason:'NO_STAMINA' };
    }

    // Deduct + move
    const after = changeStamina(-cost);
    setPlayerPosition(nx, ny);

    logBoth('stamina', `after=${after}`);
    logBoth('move', `moved to (${nx},${ny})`);

    return { ok:true };
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
      const cell = getCell(selected.x, selected.y);
      onTileClick({ ...selected, biome: cell?.biome ?? 'ocean' });
    }
    drawOverlays();
  });

  function onKeyDown(e) {
    if (e.key === '+' || e.key === '=') { camera.zoomIn(); fullRedraw(); }
    else if (e.key === '-' || e.key === '_') { camera.zoomOut(); fullRedraw(); }
    else if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) {
      const map = { ArrowUp:'N', ArrowRight:'E', ArrowDown:'S', ArrowLeft:'W' };
      const res = tryMoveCardinal(map[e.key]);
      if (res.ok) {
        drawOverlays();
      } else {
        logBoth('move', `blocked: ${res.reason}`);
      }
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // Initialize position once from state (no stamina change)
  (function initPos() {
    const start = getPlayerPosition();
    setPlayerPosition(start.x ?? 0, start.y ?? 0);
    logBoth('init', `spawn at (${start.x ?? 0},${start.y ?? 0})`);
  })();

  // Initial draw
  fullRedraw();

  return {
    updateShard(newShard) { shardData = newShard; fullRedraw(); },
    setOverlayFlags(flags) { overlayFlags = { ...overlayFlags, ...flags }; drawOverlays(); },
    screenToTile,
    destroy() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      container.removeChild(baseCanvas);
      container.removeChild(overlayCanvas);
    },
    get camera() { return camera; },
    isDevMode,
    setPlayer(pos) {
      if (typeof pos.x === 'number' && typeof pos.y === 'number') setPlayerPosition(pos.x, pos.y);
      if ('spriteLand' in pos)  spriteRefs.spriteLand  = pos.spriteLand;
      if ('spriteWater' in pos) spriteRefs.spriteWater = pos.spriteWater;
      drawOverlays();
    },
    getPlayer() { return { ...getPlayerPosition(), ...spriteRefs }; },
  };
}
