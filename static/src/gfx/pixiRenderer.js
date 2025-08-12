// Minimal Pixi renderer with a "world" container (for pan/zoom)
// API:
//   const pixi = createPixiRenderer({ canvas, shard, tileW, tileH });
//   pixi.setOrigin({ originX, originY });
//   pixi.setHover(tileOrNull);
//   pixi.setSelected(tileOrNull);
//   pixi.setShard(newShard);
//   pixi.resize();
//   pixi.zoomInAt(x,y) / pixi.zoomOutAt(x,y)
//   pixi.world  ← container you can pan/zoom

export function createPixiRenderer({ canvas, shard, tileW = 16, tileH = 8 }) {
  const PIXI = window.PIXI;
  if (!PIXI) throw new Error('[pixiRenderer] PIXI global not found');

  const app = new PIXI.Application({
    view: canvas,
    backgroundAlpha: 0,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preserveDrawingBuffer: true
  });

  const stage = app.stage;

  // WORLD container = everything lives under here (easy pan/zoom)
  const world = new PIXI.Container();
  stage.addChild(world);

  const map = new PIXI.Container();
  world.addChild(map);

  // Overlay graphics for hover + selection
  const hoverG = new PIXI.Graphics();
  const selectG = new PIXI.Graphics();
  world.addChild(selectG);
  world.addChild(hoverG);

  let _origin = { x: canvas.width / 2, y: 40 };
  let _tileW = tileW;
  let _tileH = tileH;

  function tileColor(t) {
    const biome = (t?.biome || t?.type || '').toString().toLowerCase();
    if (biome.includes('water') || biome === 'ocean') return 0x1a3a5a;
    if (biome.includes('desert') || biome.includes('sand') || biome.includes('beach')) return 0xcaa45a;
    if (biome.includes('mount') || biome.includes('rock') || biome.includes('stone')) return 0x888888;
    if (biome.includes('forest') || biome.includes('grass') || biome === 'land') return 0x4c6b3c;
    return 0x5a6f7f;
  }

  function isoToScreen(ix, iy) {
    return {
      x: _origin.x + (ix - iy) * _tileW,
      y: _origin.y + (ix + iy) * _tileH
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

  function drawShard(data) {
    // Clear previous children
    for (const c of map.removeChildren()) c.destroy?.();
    if (!data?.tiles) return;

    for (let y = 0; y < data.height; y++) {
      for (let x = 0; x < data.width; x++) {
        const t = data.tiles[y][x];
        const { x: sx, y: sy } = isoToScreen(x, y);
        const g = new PIXI.Graphics();
        drawDiamond(g, sx, sy, tileColor(t));
        map.addChild(g);
      }
    }
  }

  function outline(gfx, tx, ty, color = 0xffd700, thickness = 2) {
    gfx.clear();
    if (tx == null || ty == null) return;
    const { x: sx, y: sy } = isoToScreen(tx, ty);
    gfx.lineStyle(thickness, color, 1);
    gfx.moveTo(sx, sy - _tileH);
    gfx.lineTo(sx + _tileW, sy);
    gfx.lineTo(sx, sy + _tileH);
    gfx.lineTo(sx - _tileW, sy);
    gfx.closePath();
  }

  function setHover(tile)    { if (!tile) hoverG.clear(); else outline(hoverG, tile.x, tile.y, 0xf5e58c, 2); }
  function setSelected(tile) { if (!tile) selectG.clear(); else outline(selectG, tile.x, tile.y, 0xff8800, 2); }
  function setShard(newShard){ shard = newShard; drawShard(newShard); }
  function setOrigin(o) {
    _origin = { x: o?.originX ?? o?.x ?? _origin.x, y: o?.originY ?? o?.y ?? _origin.y };
    if (shard) drawShard(shard);
  }
  function resize() { app.renderer.resize(canvas.width, canvas.height); }

  // ---- pan (drag) + wheel-zoom on the WORLD container ----
  world.eventMode = 'static';
  world.hitArea = app.screen;

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let worldStart = { x: 0, y: 0 };

  app.view.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    worldStart.x = world.position.x;
    worldStart.y = world.position.y;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
  app.view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    world.position.set(worldStart.x + dx, worldStart.y + dy);
  });

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function setZoom(newScale, anchorX, anchorY){
    const old = world.scale.x || 1;
    const s = clamp(newScale, 0.5, 3);
    if (s === old) return;

    const mx = anchorX, my = anchorY;
    const wx = (mx - world.position.x) / old;
    const wy = (my - world.position.y) / old;
    world.scale.set(s);
    world.position.set(mx - wx * s, my - wy * s);

    const label = document.getElementById('zoomDisplay');
    if (label) label.textContent = `${Math.round(s*100)}%`;
  }
  function zoomInAt(x, y){ setZoom((world.scale.x||1) * 1.1, x, y); }
  function zoomOutAt(x, y){ setZoom((world.scale.x||1) * 0.9, x, y); }

  app.view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((world.scale.x || 1) * dir, e.offsetX, e.offsetY);
  }, { passive:false });

  // Initial draw
  if (shard) drawShard(shard);

  return {
    app,
    stage,
    world,       // <<< expose for inverse transforms
    map,
    setHover,
    setSelected,
    setShard,
    setOrigin,
    resize,
    zoomInAt,
    zoomOutAt,
  };
}
