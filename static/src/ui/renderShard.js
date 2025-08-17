import { TILE_WIDTH, TILE_HEIGHT, SHARD_COLS, SHARD_ROWS, BACKDROP_COLOR } from '../config/mapConfig.js';
import { getBiomeColor, uiColors } from '../utils/colorUtils.js';
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
  shardData,              // { tiles: 2D array [y][x] of {biome,...}, pois?: [{x,y,type:'town'|'port'}], worldSeed, shardId }
  onTileClick = () => {},
  overlay = { grid: true },
  player = { x: 0, y: 0, spriteLand: null, spriteWater: null }, // NEW
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
  let playerState = { ...player };

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

    // coast overlay: draw thin beach strips on land edges adjacent to ocean
    const s = Math.max(2, Math.floor(TILE_WIDTH * 0.18)); // strip thickness
    baseCtx.fillStyle = getBiomeColor('beach');
    for (let y = 0; y < SHARD_ROWS; y++) {
      for (let x = 0; x < SHARD_COLS; x++) {
        const c = getCell(x,y);
        if (!c || isOcean(c)) continue; // only draw on land tiles
        const px = x*TILE_WIDTH, py = y*TILE_HEIGHT;
        if (isOcean(getCell(x, y-1))) baseCtx.fillRect(px, py, TILE_WIDTH, s);                 // north edge
        if (isOcean(getCell(x+1, y))) baseCtx.fillRect(px+TILE_WIDTH-s, py, s, TILE_HEIGHT);   // east edge
        if (isOcean(getCell(x, y+1))) baseCtx.fillRect(px, py+TILE_HEIGHT-s, TILE_WIDTH, s);   // south edge
        if (isOcean(getCell(x-1, y))) baseCtx.fillRect(px, py, s, TILE_HEIGHT);                // west edge
      }
    }

    // POIs (town/port markers)
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
    if (playerState.x < 0) return;
    overlayCtx.save();
    camera.apply(overlayCtx);

    const cell = getCell(playerState.x, playerState.y);
    const onWater = isOcean(cell);
    const img = onWater ? playerState.spriteWater : playerState.spriteLand;

    const px = playerState.x*TILE_WIDTH + TILE_WIDTH/2;
    const py = playerState.y*TILE_HEIGHT + TILE_HEIGHT/2;

    if (img && img.complete) {
      const scale = Math.min(TILE_WIDTH, TILE_HEIGHT) / Math.max(img.width, img.height) * 0.9;
      const w = img.width * scale;
      const h = img.height * scale;
      overlayCtx.drawImage(img, px - w/2, py - h/2, w, h);
    } else {
      // fallback: diamond
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

    // player is on overlay too
    drawPlayer();
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
      const cell = getCell(selected.x, selected.y);
      onTileClick({ ...selected, biome: cell?.biome ?? 'ocean' });
    }
    drawOverlays();
  });

  function onKeyDown(e) {
    if (e.key === '+' || e.key === '=') { camera.zoomIn(); fullRedraw(); }
    else if (e.key === '-' || e.key === '_') { camera.zoomOut(); fullRedraw(); }
    // Optional: arrows move player one tile
    else if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) {
      const dir = { ArrowUp:[0,-1], ArrowRight:[1,0], ArrowDown:[0,1], ArrowLeft:[-1,0] }[e.key];
      const nx = Math.min(Math.max(playerState.x + dir[0], 0), SHARD_COLS-1);
      const ny = Math.min(Math.max(playerState.y + dir[1], 0), SHARD_ROWS-1);
      playerState.x = nx; playerState.y = ny;
      drawOverlays();
    }
  }
  window.addEventListener('keydown', onKeyDown);

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
    // NEW:
    setPlayer(pos) { playerState = { ...playerState, ...pos }; drawOverlays(); },
    getPlayer() { return { ...playerState }; },
  };
}
