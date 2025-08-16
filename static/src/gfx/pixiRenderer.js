// /static/src/gfx/pixiRenderer.js
// Chunked Pixi renderer for large shards (e.g., 250x250, 500x500).
// - One render texture per CHUNK (default 64x64 tiles) instead of per-tile objects.
// - Drag-to-pan, wheel + pinch zoom built-in.
// - Hover/selection overlays + player token layer kept on top.
// - Culling toggles chunk visibility based on the view.
//
// API:
//   const pixi = createPixiRenderer({ canvas, shard, tileW, tileH, chunkSize });
//   pixi.setShard(shard)            // rebuild chunks
//   pixi.setOrigin({x,y}|{originX,originY})  // shift all chunks by delta (no rebuild)
//   pixi.setHover(tile|null)        // {x,y}
//   pixi.setSelected(tile|null)     // {x,y}
//   pixi.setPlayer(tx,ty)
//   pixi.centerOn(tx,ty, canvasW,canvasH)
//   pixi.resize()
//   pixi.world                      // PIXI.Container (pan/zoom root)

export function createPixiRenderer({
  canvas,
  shard,
  tileW = 16,
  tileH = 8,
  chunkSize = 64,
}) {
  const PIXI = window.PIXI;
  if (!PIXI) throw new Error('[pixiRenderer] PIXI global not found');

  const app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });

  const stage = app.stage;
  const world = new PIXI.Container();
  stage.addChild(world);

  // Ground map container holds chunk sprites
  const map = new PIXI.Container();
  world.addChild(map);

  // Overlays (stay above ground)
  const selectG = new PIXI.Graphics();
  const hoverG  = new PIXI.Graphics();
  world.addChild(selectG);
  world.addChild(hoverG);

  // Player token
  const playerG = new PIXI.Graphics();
  world.addChild(playerG);
  let playerPos = { x: null, y: null };

  // Iso geometry + origin (screen-space, pre-world transform)
  let _tileW = tileW, _tileH = tileH;
  let _origin = { x: canvas.width / 2, y: 40 };

  // Chunks: array of { cx, cy, sprite, aabb:{x0,y0,x1,y1} } where aabb is in world-local coords
  let _chunks = [];
  let _lastCullKey = '';

  function tileColor(t) {
    const b = (t?.biome || t?.type || '').toString().toLowerCase();
    if (b.includes('water') || b === 'ocean') return 0x1a3a5a;
    if (b.includes('desert') || b.includes('sand') || b.includes('beach')) return 0xcaa45a;
    if (b.includes('mount') || b.includes('rock') || b.includes('stone')) return 0x888888;
    if (b.includes('forest') || b.includes('grass') || b === 'land') return 0x4c6b3c;
    return 0x5a6f7f;
  }

  function isoToScreen(ix, iy) {
    return {
      x: _origin.x + (ix - iy) * _tileW,
      y: _origin.y + (ix + iy) * _tileH,
    };
  }

  function drawDiamond(g, sx, sy, fill, outline = 0x000000, outlineAlpha = 0.15) {
    g.beginFill(fill);
    g.lineStyle(1, outline, outlineAlpha);
    g.moveTo(sx, sy - _tileH);
    g.lineTo(sx + _tileW, sy);
    g.lineTo(sx, sy + _tileH);
    g.lineTo(sx - _tileW, sy);
    g.closePath();
    g.endFill();
  }

  function chunkCornersToAABB(cx, cy, size) {
    const x0 = cx * size;
    const y0 = cy * size;
    const x1 = Math.min(x0 + size - 1, shard.width - 1);
    const y1 = Math.min(y0 + size - 1, shard.height - 1);

    const c = [
      isoToScreen(x0, y0),
      isoToScreen(x1, y0),
      isoToScreen(x0, y1),
      isoToScreen(x1, y1),
    ];
    // Expand by tile half extents so diamonds fit fully
    const xs = c.map(p => p.x);
    const ys = c.map(p => p.y);
    let minX = Math.min(...xs) - _tileW;
    let maxX = Math.max(...xs) + _tileW;
    let minY = Math.min(...ys) - _tileH;
    let maxY = Math.max(...ys) + _tileH;

    return { x0: minX, y0: minY, x1: maxX, y1: maxY, tx0: x0, ty0: y0, tx1: x1, ty1: y1 };
  }

  function buildChunkSprite(cx, cy) {
    const aabb = chunkCornersToAABB(cx, cy, chunkSize);
    const g = new PIXI.Graphics();

    // Draw tiles offset so the chunk's top-left is at (0,0)
    const offX = -aabb.x0;
    const offY = -aabb.y0;

    for (let ty = aabb.ty0; ty <= aabb.ty1; ty++) {
      for (let tx = aabb.tx0; tx <= aabb.tx1; tx++) {
        const t = shard.tiles[ty][tx];
        const p = isoToScreen(tx, ty);
        drawDiamond(g, p.x + offX, p.y + offY, tileColor(t));
      }
    }

    const tex = app.renderer.generateTexture(g);
    g.destroy(true);

    const sprite = new PIXI.Sprite(tex);
    sprite.x = aabb.x0;
    sprite.y = aabb.y0;

    map.addChild(sprite);
    return { cx, cy, sprite, aabb: { x0: aabb.x0, y0: aabb.y0, x1: aabb.x1, y1: aabb.y1 } };
  }

  function rebuildChunks() {
    // Clear existing
    for (const child of map.removeChildren()) child.destroy?.({ children: true, texture: true, baseTexture: true });
    _chunks.length = 0;

    if (!shard?.tiles) return;

    const nx = Math.ceil(shard.width / chunkSize);
    const ny = Math.ceil(shard.height / chunkSize);

    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx < nx; cx++) {
        _chunks.push(buildChunkSprite(cx, cy));
      }
    }
    // Repaint overlays (hover/select/player) after rebuild
    if (_lastHover) setHover(_lastHover);
    if (_lastSelected) setSelected(_lastSelected);
    if (playerPos.x != null) drawPlayer();

    updateCulling(true);
  }

  // ---- Culling ----
  function getViewRectLocal() {
    const s = world.scale.x || 1;
    const pos = world.position || { x: 0, y: 0 };
    // Convert screen rect [0,w]x[0,h] to world-local coords (pre-scale, pre-translation)
    const x0 = (0 - pos.x) / s;
    const y0 = (0 - pos.y) / s;
    const x1 = (canvas.width - pos.x) / s;
    const y1 = (canvas.height - pos.y) / s;
    return { x0, y0, x1, y1 };
  }
  function rectsIntersect(a, b, margin = 256) {
    return !(a.x1 < b.x0 - margin || a.x0 > b.x1 + margin || a.y1 < b.y0 - margin || a.y0 > b.y1 + margin);
  }
  function updateCulling(force = false) {
    const key = `${world.position.x}|${world.position.y}|${world.scale.x}|${canvas.width}|${canvas.height}`;
    if (!force && key === _lastCullKey) return;
    _lastCullKey = key;

    const view = getViewRectLocal();
    for (const ch of _chunks) {
      ch.sprite.visible = rectsIntersect(ch.aabb, view);
    }
  }

  // ---- Overlays ----
  let _lastHover = null, _lastSelected = null;

  function outline(gfx, tx, ty, color = 0xffd700, thickness = 2) {
    gfx.clear();
    if (tx == null || ty == null) return;
    const p = isoToScreen(tx, ty);
    gfx.lineStyle(thickness, color, 1);
    gfx.moveTo(p.x, p.y - _tileH);
    gfx.lineTo(p.x + _tileW, p.y);
    gfx.lineTo(p.x, p.y + _tileH);
    gfx.lineTo(p.x - _tileW, p.y);
    gfx.closePath();
  }
  function setHover(tile) {
    _lastHover = tile || null;
    if (!tile) { hoverG.clear(); return; }
    outline(hoverG, tile.x, tile.y, 0xf5e58c, 2);
  }
  function setSelected(tile) {
    _lastSelected = tile || null;
    if (!tile) { selectG.clear(); return; }
    outline(selectG, tile.x, tile.y, 0xff8800, 2);
  }
  function drawPlayer() {
    playerG.clear();
    if (playerPos.x == null) return;
    const p = isoToScreen(playerPos.x, playerPos.y);
    // shadow
    playerG.beginFill(0x000000, 0.25);
    playerG.drawCircle(p.x, p.y + 2, 4);
    playerG.endFill();
    // rune/diamond
    playerG.beginFill(0xffffff);
    playerG.lineStyle(2, 0x3aa0ff, 1);
    playerG.moveTo(p.x, p.y - _tileH * 0.8);
    playerG.lineTo(p.x + _tileW * 0.6, p.y);
    playerG.lineTo(p.x, p.y + _tileH * 0.8);
    playerG.lineTo(p.x - _tileW * 0.6, p.y);
    playerG.closePath();
    playerG.endFill();
  }

  // ---- Public API ----
  function setPlayer(tx, ty) { playerPos.x = tx; playerPos.y = ty; drawPlayer(); }
  function setShard(newShard) { shard = newShard; rebuildChunks(); }
  function setOrigin(o) {
    const newO = { x: o?.originX ?? o?.x ?? _origin.x, y: o?.originY ?? o?.y ?? _origin.y };
    const dx = newO.x - _origin.x;
    const dy = newO.y - _origin.y;
    _origin = newO;
    // Shift all chunk sprites + their AABBs by delta (no rebuild needed)
    for (const ch of _chunks) {
      ch.sprite.x += dx;
      ch.sprite.y += dy;
      ch.aabb.x0 += dx; ch.aabb.x1 += dx;
      ch.aabb.y0 += dy; ch.aabb.y1 += dy;
    }
    // Re-stroke overlays at new origin
    if (_lastHover) setHover(_lastHover);
    if (_lastSelected) setSelected(_lastSelected);
    if (playerPos.x != null) drawPlayer();
    updateCulling(true);
  }
  function resize() { app.renderer.resize(canvas.width, canvas.height); updateCulling(true); }
  function centerOn(tx, ty, canvasW, canvasH) {
    const s = world.scale.x || 1;
    const p = isoToScreen(tx, ty); // pre-scale coords
    world.position.set(canvasW/2 - p.x * s, canvasH/2 - p.y * s);
    updateCulling(true);
  }

  // ---- Pan/Zoom ----
  world.eventMode = 'static';
  world.hitArea = app.screen;

  // Drag
  let dragging = false, dragStart = { x: 0, y: 0 }, worldStart = { x: 0, y: 0 };
  app.view.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragStart.x = e.clientX; dragStart.y = e.clientY;
    worldStart.x = world.position.x; worldStart.y = world.position.y;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  app.view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    world.position.set(worldStart.x + dx, worldStart.y + dy);
    updateCulling();
  });

  // Wheel zoom
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function setZoom(newScale, anchorX, anchorY){
    const old = world.scale.x || 1;
    const s = clamp(newScale, 0.25, 3); // allow farther zoom-out for huge shards
    if (s === old) return;
    const mx = anchorX, my = anchorY;
    const wx = (mx - world.position.x) / old;
    const wy = (my - world.position.y) / old;
    world.scale.set(s);
    world.position.set(mx - wx * s, my - wy * s);
    updateCulling(true);
  }
  app.view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((world.scale.x || 1) * dir, e.offsetX, e.offsetY);
  }, { passive: false });

  // Pinch zoom (two fingers)
  let pinch = null;
  function tpts(e){
    const r = app.view.getBoundingClientRect();
    return Array.from(e.touches).map(t=>({ x: t.clientX - r.left, y: t.clientY - r.top }));
  }
  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
  function mid(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }

  app.view.addEventListener('touchstart', (e) => {
    if (e.touches.length < 2) { pinch = null; return; }
    const pts = tpts(e);
    pinch = { lastM: mid(pts[0], pts[1]), lastD: dist(pts[0], pts[1]) };
  }, { passive: true });

  app.view.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length < 2) return;
    e.preventDefault();

    const pts = tpts(e);
    const m = mid(pts[0], pts[1]);
    const d = dist(pts[0], pts[1]);

    const now = (world.scale.x || 1) * (d / pinch.lastD);
    setZoom(now, m.x, m.y);

    const dx = m.x - pinch.lastM.x;
    const dy = m.y - pinch.lastM.y;
    world.position.x += dx;
    world.position.y += dy;

    pinch.lastM = m; pinch.lastD = d;
    updateCulling();
  }, { passive: false });

  app.view.addEventListener('touchend', () => { pinch = null; }, { passive: true });

  // Initial build
  if (shard) rebuildChunks();

  return {
    app, stage, world, map,
    setShard, setOrigin, setHover, setSelected,
    setPlayer, centerOn, resize,
    isoToScreen,
  };
}