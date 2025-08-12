// Minimal Pixi renderer with WORLD container (pan/zoom) and Player token
// API: createPixiRenderer({ canvas, shard, tileW, tileH })
//      .setOrigin({originX,originY}) .setShard(shard)
//      .setHover(tile) .setSelected(tile)
//      .setPlayer(tx,ty) .centerOn(tx,ty, canvasW, canvasH)
//      .zoomInAt(x,y) .zoomOutAt(x,y)
//      .world (container), .isoToScreen(tx,ty)

export function createPixiRenderer({ canvas, shard, tileW = 16, tileH = 8 }) {
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

  const map = new PIXI.Container();
  world.addChild(map);

  const selectG = new PIXI.Graphics();
  const hoverG  = new PIXI.Graphics();
  world.addChild(selectG);
  world.addChild(hoverG);

  // Player token layer (simple rune/diamond + drop shadow)
  const playerG = new PIXI.Graphics();
  world.addChild(playerG);
  let playerPos = { x: null, y: null };

  let _origin = { x: canvas.width / 2, y: 40 };
  let _tileW = tileW, _tileH = tileH;

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

  function drawShard(data) {
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
    // redraw overlays after map
    if (playerPos.x != null) drawPlayer();
    if (hoverG.graphicsData?.length) setHover(_lastHover);
    if (selectG.graphicsData?.length) setSelected(_lastSelected);
  }

  let _lastHover = null, _lastSelected = null;

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
    const { x: sx, y: sy } = isoToScreen(playerPos.x, playerPos.y);

    // drop shadow
    playerG.beginFill(0x000000, 0.25);
    playerG.drawCircle(sx, sy + 2, 4);
    playerG.endFill();

    // rune/diamond
    playerG.beginFill(0xffffff);
    playerG.lineStyle(2, 0x3aa0ff, 1);
    playerG.moveTo(sx, sy - _tileH * 0.8);
    playerG.lineTo(sx + _tileW * 0.6, sy);
    playerG.lineTo(sx, sy + _tileH * 0.8);
    playerG.lineTo(sx - _tileW * 0.6, sy);
    playerG.closePath();
    playerG.endFill();
  }

  function setPlayer(tx, ty) {
    playerPos.x = tx;
    playerPos.y = ty;
    drawPlayer();
  }

  function setShard(newShard) { shard = newShard; drawShard(newShard); }

  function setOrigin(o) {
    _origin = { x: o?.originX ?? o?.x ?? _origin.x, y: o?.originY ?? o?.y ?? _origin.y };
    if (shard) drawShard(shard);
  }

  function resize() {
    app.renderer.resize(canvas.width, canvas.height);
  }

  // Pan (drag) + wheel zoom on WORLD
  world.eventMode = 'static';
  world.hitArea = app.screen;
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
  });

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
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
  function zoomInAt(x,y){ setZoom((world.scale.x||1)*1.1, x, y); }
  function zoomOutAt(x,y){ setZoom((world.scale.x||1)*0.9, x, y); }

  function centerOn(tx, ty, canvasW, canvasH) {
    const s = world.scale.x || 1;
    const p = isoToScreen(tx, ty); // world coords before scale
    world.position.set(canvasW/2 - p.x * s, canvasH/2 - p.y * s);
  }

  if (shard) drawShard(shard);

  return {
    app, stage, world, map,
    setHover, setSelected, setShard, setOrigin, resize,
    setPlayer, centerOn, zoomInAt, zoomOutAt,
    isoToScreen,
  };
}
