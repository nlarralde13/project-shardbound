// /static/src/gfx/pixiRenderer.js
// pixiRenderer v4 — chunk streaming, LRU, DPR-safe textures (res=1), no overview
// API: createPixiRenderer({ canvas, shard, tileW, tileH, chunkSize, maxResidentChunks, prefetchRadius, buildBudgetMs })
//  -> { app, world, map, setShard, setOrigin, resize, centerOn, setHover, setSelected, setPlayer, isoToScreen, getOrigin }

export function createPixiRenderer({
  canvas,
  shard,
  tileW = 16,            // half logical tile width (32 => 16)
  tileH = 8,             // half logical tile height (16 => 8)
  chunkSize = 64,        // safe, larger chunks reduce sprite count
  maxResidentChunks = 36,
  prefetchRadius = 1,
  buildBudgetMs = 6,
  overviewEnabled = false,   // kept for compatibility; ignored here
} = {}) {
  const PIXI = window.PIXI;
  if (!PIXI) throw new Error('[pixiRenderer] PIXI global not found');
  if (!canvas) throw new Error('[pixiRenderer] canvas is required');
  if (!shard || !Number.isFinite(shard.width) || !Number.isFinite(shard.height) || !Array.isArray(shard.tiles)) {
    throw new Error('[pixiRenderer] invalid shard: expected {width, height, tiles}');
  }

  // Crisp + low memory defaults
  PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
  PIXI.settings.ROUND_PIXELS = true;
  PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF;
  PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

  // IMPORTANT: resolution=1 so textures/backbuffer aren't multiplied by devicePixelRatio
  const app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,
    resolution: 1,              // force 1x backing store
    autoDensity: true,          // CSS size stays correct
    antialias: false,
    powerPreference: 'high-performance',
  });

  /* ── Scene graph ───────────────────────────────────── */
  const stage = app.stage; stage.roundPixels = true;
  const world = new PIXI.Container(); world.roundPixels = true; stage.addChild(world);
  const map = new PIXI.Container(); map.roundPixels = true; world.addChild(map);

  const selectG = new PIXI.Graphics(); selectG.roundPixels = true; world.addChild(selectG);
  const hoverG  = new PIXI.Graphics(); hoverG .roundPixels = true; world.addChild(hoverG);
  const playerG = new PIXI.Graphics(); playerG.roundPixels = true; world.addChild(playerG);
  let playerPos = { x: null, y: null };

  /* ── Iso math ──────────────────────────────────────── */
  let _tileW = tileW, _tileH = tileH;
  let _origin = { x: (canvas.width|0) / 2, y: 40 }; // authoritative origin, rounded in setOrigin()

  const isoToScreen = (ix, iy) => ({
    x: _origin.x + (ix - iy) * _tileW,
    y: _origin.y + (ix + iy) * _tileH,
  });

  const tileColor = (t) => {
    const b = (t?.biome || t?.type || '').toString().toLowerCase();
    if (b.includes('water') || b === 'ocean') return 0x1a3a5a;
    if (b.includes('desert') || b.includes('sand') || b.includes('beach')) return 0xcaa45a;
    if (b.includes('mount') || b.includes('rock') || b.includes('stone')) return 0x888888;
    if (b.includes('forest') || b.includes('grass') || b === 'land') return 0x4c6b3c;
    return 0x5a6f7f;
  };

  function fillDiamond(g, sx, sy, fill) { // no stroke → avoids hairline seams
    g.beginFill(fill);
    g.moveTo(sx, sy - _tileH);
    g.lineTo(sx + _tileW, sy);
    g.lineTo(sx, sy + _tileH);
    g.lineTo(sx - _tileW, sy);
    g.closePath();
    g.endFill();
  }

  /* ── AABBs ─────────────────────────────────────────── */
  function rawChunkAABB(cx, cy, size) {
    const tx0 = cx * size, ty0 = cy * size;
    const tx1 = Math.min(tx0 + size - 1, shard.width  - 1);
    const ty1 = Math.min(ty0 + size - 1, shard.height - 1);
    const c = [
      isoToScreen(tx0, ty0),
      isoToScreen(tx1, ty0),
      isoToScreen(tx0, ty1),
      isoToScreen(tx1, ty1),
    ];
    const xs = c.map(p=>p.x), ys = c.map(p=>p.y);
    return {
      x0: Math.min(...xs) - _tileW,
      y0: Math.min(...ys) - _tileH,
      x1: Math.max(...xs) + _tileW,
      y1: Math.max(...ys) + _tileH,
      tx0, ty0, tx1, ty1,
    };
  }

  /* ── Chunks + LRU + build queue ────────────────────── */
  // chunk = { cx, cy, sprite, tex, aabb, roundX, roundY, lastUsed, building }
  const chunks = new Map();
  let buildQueue = [];           // keys "cx,cy"
  const building = new Set();
  let tickCounter = 0;

  function getChunk(cx, cy) {
    const key = `${cx},${cy}`;
    let ch = chunks.get(key);
    if (!ch) {
      const a = rawChunkAABB(cx, cy, chunkSize);
      const rx = Math.round(a.x0), ry = Math.round(a.y0);
      const dx = rx - a.x0,       dy = ry - a.y0;
      ch = {
        cx, cy,
        sprite: null, tex: null,
        aabb: { x0: rx, y0: ry, x1: a.x1 + dx, y1: a.y1 + dy, tx0: a.tx0, ty0: a.ty0, tx1: a.tx1, ty1: a.ty1 },
        roundX: rx, roundY: ry,
        lastUsed: 0,
        building: false,
      };
      chunks.set(key, ch);
    }
    return ch;
  }

  function enqueueBuild(cx, cy, front = false) {
    const key = `${cx},${cy}`;
    const ch = getChunk(cx, cy);
    if (ch.building || ch.sprite) return;
    if (building.has(key)) return;
    if (front) buildQueue.unshift(key); else buildQueue.push(key);
    building.add(key);
  }

  function buildChunkTexture(ch) {
    const g = new PIXI.Graphics();
    const offX = -ch.roundX, offY = -ch.roundY;

    // 1-tile bleed around chunk edges to hide seams
    const tx0 = Math.max(0, ch.aabb.tx0 - 1);
    const ty0 = Math.max(0, ch.aabb.ty0 - 1);
    const tx1 = Math.min(shard.width  - 1, ch.aabb.tx1 + 1);
    const ty1 = Math.min(shard.height - 1, ch.aabb.ty1 + 1);

    for (let ty = ty0; ty <= ty1; ty++) {
      const row = shard.tiles[ty];
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = row[tx];
        const p = isoToScreen(tx, ty);
        fillDiamond(g, p.x + offX, p.y + offY, tileColor(t));
      }
    }

    // Generate texture at resolution=1 to cap VRAM usage
    const tex = app.renderer.generateTexture(g, { resolution: 1, scaleMode: PIXI.SCALE_MODES.NEAREST });
    g.destroy(true);
    return tex;
  }

  function attachChunkSprite(ch) {
    const sp = ch.sprite = new PIXI.Sprite(ch.tex);
    sp.roundPixels = true;
    sp.x = ch.roundX; sp.y = ch.roundY;
    sp.visible = false;
    map.addChild(sp);
  }

  function evictLRU() {
    if (chunks.size <= maxResidentChunks) return;
    const cand = [];
    for (const [key, ch] of chunks) {
      if (ch.sprite && !ch.sprite.visible && !ch.building) cand.push([key, ch.lastUsed]);
    }
    cand.sort((a,b) => a[1] - b[1]); // oldest first
    for (const [key] of cand) {
      if (chunks.size <= maxResidentChunks) break;
      const ch = chunks.get(key);
      ch?.sprite?.destroy({ children:false, texture:true, baseTexture:true });
      ch?.tex?.destroy(true);
      chunks.delete(key);
    }
  }

  function pumpBuilder() {
    if (pumpBuilder._scheduled) return;
    pumpBuilder._scheduled = true;
    requestAnimationFrame(() => {
      pumpBuilder._scheduled = false;
      const start = performance.now();
      while (buildQueue.length) {
        const key = buildQueue.shift();
        building.delete(key);
        const ch = chunks.get(key);
        if (!ch || ch.sprite || ch.building) continue;

        ch.building = true;
        ch.tex = buildChunkTexture(ch);
        attachChunkSprite(ch);
        ch.building = false;
        ch.lastUsed = ++tickCounter;

        if (performance.now() - start > buildBudgetMs) break;
      }
      if (buildQueue.length) pumpBuilder();
      evictLRU();
      updateCulling(true);
    });
  }

  /* ── Culling ───────────────────────────────────────── */
  let _lastCullKey = '';

  const getViewRectLocal = () => {
    const s = world.scale.x || 1, pos = world.position || { x:0, y:0 };
    return { x0:(0-pos.x)/s, y0:(0-pos.y)/s, x1:(canvas.width-pos.x)/s, y1:(canvas.height-pos.y)/s };
  };
  const rectsIntersect = (a,b,margin=128) =>
    !(a.x1 < b.x0 - margin || a.x0 > b.x1 + margin || a.y1 < b.y0 - margin || a.y0 > b.y1 + margin);

  function visibleChunkSet(view) {
    const want = new Set();
    const nx = Math.ceil(shard.width / chunkSize);
    const ny = Math.ceil(shard.height / chunkSize);
    for (let cy = 0; cy < ny; cy++) {
      for (let cx = 0; cx < nx; cx++) {
        const ch = getChunk(cx, cy);
        if (rectsIntersect(ch.aabb, view, 128)) want.add(`${cx},${cy}`);
      }
    }
    if (prefetchRadius > 0) {
      const add = [];
      for (const key of want) {
        const [cx, cy] = key.split(',').map(Number);
        for (let dy = -prefetchRadius; dy <= prefetchRadius; dy++) {
          for (let dx = -prefetchRadius; dx <= prefetchRadius; dx++) {
            const nxC = cx + dx, nyC = cy + dy;
            if (nxC < 0 || nyC < 0) continue;
            if (nxC >= Math.ceil(shard.width / chunkSize) || nyC >= Math.ceil(shard.height / chunkSize)) continue;
            add.push(`${nxC},${nyC}`);
          }
        }
      }
      add.forEach(k => want.add(k));
    }
    return want;
  }

  function updateCulling(force=false) {
    const s = world.scale.x || 1;
    const key = `${world.position.x}|${world.position.y}|${s}|${canvas.width}|${canvas.height}`;
    if (!force && key === _lastCullKey) return;
    _lastCullKey = key;

    const view = getViewRectLocal();
    const want = visibleChunkSet(view);

    for (const key of want) {
      const ch = chunks.get(key) || getChunk(...key.split(',').map(Number));
      if (!ch.sprite && !ch.building) enqueueBuild(ch.cx, ch.cy);
      if (ch.sprite) { ch.sprite.visible = true; ch.lastUsed = ++tickCounter; }
    }
    for (const [key, ch] of chunks) if (!want.has(key) && ch.sprite) ch.sprite.visible = false;
    if (buildQueue.length) pumpBuilder();
  }

  /* ── Overlays ──────────────────────────────────────── */
  let _lastHover = null, _lastSelected = null;

  function outline(gfx, tx, ty, color=0xffd700, thickness=2) {
    gfx.clear(); if (tx == null || ty == null) return;
    const p = isoToScreen(tx, ty);
    const s = world.scale.x || 1;
    const th = Math.max(1, Math.round(thickness * Math.min(1, s)));
    gfx.lineStyle(th, color, 1);
    gfx.moveTo(p.x, p.y - _tileH);
    gfx.lineTo(p.x + _tileW, p.y);
    gfx.lineTo(p.x, p.y + _tileH);
    gfx.lineTo(p.x - _tileW, p.y);
    gfx.closePath();
  }
  function setHover(tile){ _lastHover = tile || null; if (!tile) hoverG.clear(); else outline(hoverG,  tile.x, tile.y, 0xf5e58c, 2); }
  function setSelected(tile){ _lastSelected = tile || null; if (!tile) selectG.clear(); else outline(selectG, tile.x, tile.y, 0xff8800, 2); }

  function drawPlayer() {
    playerG.clear();
    if (playerPos.x == null || playerPos.y == null) return;
    const p = isoToScreen(playerPos.x, playerPos.y);
    const s = world.scale.x || 1;
    const th = Math.max(1, Math.round(2 * Math.min(1, s)));

    // soft drop shadow
    playerG.beginFill(0x000000, 0.22);
    playerG.drawCircle(p.x, p.y + 2, Math.max(2, Math.round(3 * Math.min(1, s))));
    playerG.endFill();

    // diamond exactly one tile
    playerG.lineStyle(th, 0x3aa0ff, 1);
    playerG.beginFill(0xffffff, 1);
    playerG.moveTo(p.x,          p.y - _tileH);
    playerG.lineTo(p.x + _tileW, p.y);
    playerG.lineTo(p.x,          p.y + _tileH);
    playerG.lineTo(p.x - _tileW, p.y);
    playerG.closePath();
    playerG.endFill();
  }

  /* ── Public API & lifecycle ────────────────────────── */
  function setPlayer(tx, ty) { playerPos.x = tx; playerPos.y = ty; drawPlayer(); }

  function setShard(newShard) {
    shard = newShard;
    for (const [_k, ch] of chunks) { ch.sprite?.destroy({ texture:true, baseTexture:true }); ch.tex?.destroy(true); }
    chunks.clear(); buildQueue = []; building.clear();
    updateCulling(true);
    if (_lastHover) setHover(_lastHover);
    if (_lastSelected) setSelected(_lastSelected);
    drawPlayer();
  }

  function setOrigin(o) {
    const nx = o?.originX ?? o?.x ?? _origin.x;
    const ny = o?.originY ?? o?.y ?? _origin.y;
    const dx = Math.round(nx - _origin.x);
    const dy = Math.round(ny - _origin.y);
    _origin = { x: _origin.x + dx, y: _origin.y + dy };

    for (const [_k, ch] of chunks) {
      ch.roundX += dx; ch.roundY += dy;
      ch.aabb.x0 += dx; ch.aabb.x1 += dx; ch.aabb.y0 += dy; ch.aabb.y1 += dy;
      if (ch.sprite) { ch.sprite.x = ch.roundX; ch.sprite.y = ch.roundY; }
    }
    if (_lastHover) setHover(_lastHover);
    if (_lastSelected) setSelected(_lastSelected);
    drawPlayer();
    updateCulling(true);
  }

  function resize() { app.renderer.resize(canvas.width, canvas.height); updateCulling(true); }

  function centerOn(tx, ty, canvasW, canvasH) {
    const s = world.scale.x || 1;
    const p = isoToScreen(tx, ty);
    world.position.set(Math.round(canvasW/2 - p.x * s), Math.round(canvasH/2 - p.y * s));
    updateCulling(true);
  }

  /* ── Pan & Zoom ────────────────────────────────────── */
  world.eventMode = 'static';
  world.hitArea   = app.screen;

  let dragging = false, dragStart = { x:0, y:0 }, worldStart = { x:0, y:0 };
  app.view.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragStart.x = e.clientX; dragStart.y = e.clientY;
    worldStart.x = world.position.x; worldStart.y = world.position.y;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  app.view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    world.position.set(
      Math.round(worldStart.x + (e.clientX - dragStart.x)),
      Math.round(worldStart.y + (e.clientY - dragStart.y))
    );
    updateCulling();
  });

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  function setZoom(newScale, anchorX, anchorY) {
    const old = world.scale.x || 1;
    const s   = clamp(newScale, 0.25, 3);
    if (s === old) return;
    const mx = anchorX, my = anchorY;
    const wx = (mx - world.position.x) / old;
    const wy = (my - world.position.y) / old;
    world.scale.set(s);
    world.position.set(
      Math.round(mx - wx * s),
      Math.round(my - wy * s)
    );
    updateCulling(true);
  }

  app.view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((world.scale.x || 1) * dir, e.offsetX, e.offsetY);
  }, { passive:false });

  // Pinch zoom (mobile)
  let pinch = null;
  const tpts = (e) => { const r = app.view.getBoundingClientRect(); return Array.from(e.touches).map(t=>({ x:t.clientX-r.left, y:t.clientY-r.top })); };
  const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
  const mid  = (a,b)=>({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });

  app.view.addEventListener('touchstart', (e) => {
    if (e.touches.length < 2) { pinch = null; return; }
    const pts = tpts(e);
    pinch = { lastM: mid(pts[0], pts[1]), lastD: dist(pts[0], pts[1]) };
  }, { passive:true });

  app.view.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length < 2) return;
    e.preventDefault();
    const pts = tpts(e);
    const m = mid(pts[0], pts[1]);
    const d = dist(pts[0], pts[1]);
    setZoom((world.scale.x || 1) * (d / pinch.lastD), m.x, m.y);
    world.position.x = Math.round(world.position.x + (m.x - pinch.lastM.x));
    world.position.y = Math.round(world.position.y + (m.y - pinch.lastM.y));
    pinch.lastM = m; pinch.lastD = d;
    updateCulling();
  }, { passive:false });

  app.view.addEventListener('touchend', () => { pinch = null; }, { passive:true });

  // Start
  updateCulling(true);

  return {
    app, world, map,
    setShard, setOrigin, resize, centerOn,
    setHover, setSelected, setPlayer,
    isoToScreen,
    getOrigin: () => ({ x: _origin.x, y: _origin.y }),
  };
}
