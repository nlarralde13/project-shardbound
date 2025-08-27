// overlayMap.js — Map overlay (logic only; styling lives in mapOverlay.css)
//
// initOverlayMap({ devMode=false }):
//   .setShard(shard)      // expects .grid + optional .layers.* or .sites[]
//   .setPos(x,y)
//   .setTitle(text)
//   .render()
//
// Layers supported (if present):
//   shard.grid                               -> biome tiles
//   shard.layers.rivers.paths                -> polylines
//   shard.layers.lakes.{cells|polygons}      -> water fills
//   shard.layers.roads.paths                 -> polylines
//   shard.layers.bridges[]                   -> small rects
//   shard.layers.settlements.{cities,towns,villages,ports}  OR  shard.sites[]
//
// Nothing here injects CSS. Include /static/css/mapOverlay.css in your HTML.

export function initOverlayMap({ devMode = false } = {}) {
  const root = document.getElementById('overlayMap');
  if (!root) return stub();

  // -------- scaffold (structure only) --------
  // root
  root.classList.add('overlay'); // shell display controlled by mvp3.js (add/remove .hidden)

  // panel (paper shell)
  const panel = ensure(root, '.map-panel', () => {
    const p = document.createElement('div');
    p.className = 'map-panel';
    return p;
  });

  // top banner
  const top = ensure(panel, '.map-top', () => {
    const t = document.createElement('header');
    t.className = 'map-top';
    t.innerHTML = `
      <div class="map-top__inner">
        <div class="map-title">World Map</div>
        <button type="button" class="btn btn--blue map-close" id="mapCloseBtn">Close (M)</button>
      </div>`;
    return t;
  });

  // frame + holder + canvases
  const frame = ensure(panel, '.map-frame', () => {
    const f = document.createElement('section'); f.className = 'map-frame'; return f;
  });
  const holder = ensure(frame, '.map-holder', () => {
    const d = document.createElement('div'); d.className = 'map-holder'; return d;
  });
  const box = ensure(holder, '.map-box', () => {
    const b = document.createElement('div'); b.className = 'map-box'; return b;
  });

  // canvas layers: base grid, hydrology/roads, poi
  const gridCanvas = ensure(box, 'canvas.map-base', () => {
    const c = document.createElement('canvas'); c.className = 'map-base'; c.width = 640; c.height = 640; return c;
  });
  const fxCanvas = ensure(box, 'canvas#mapFX', () => {
    const c = document.createElement('canvas'); c.id = 'mapFX'; c.width = 640; c.height = 640; return c;
  });
  const poiCanvas = ensure(box, 'canvas#mapPOI', () => {
    const c = document.createElement('canvas'); c.id = 'mapPOI'; c.width = 640; c.height = 640; return c;
  });

  // bottom banner (legend + toggles)
  const bottom = ensure(panel, '.map-bottom', () => {
    const b = document.createElement('footer');
    b.className = 'map-bottom';
    b.innerHTML = `
      <div class="map-bottom__inner">
        <div class="legend-list">
          <span class="legend-item"><span class="swatch ocean"></span>Ocean</span>
          <span class="legend-item"><span class="swatch coast"></span>Coast</span>
          <span class="legend-item"><span class="swatch plains"></span>Plains</span>
          <span class="legend-item"><span class="swatch forest"></span>Forest</span>
          <span class="legend-item"><span class="dot city"></span>City</span>
          <span class="legend-item"><span class="dot town"></span>Town</span>
          <span class="legend-item"><span class="dot village"></span>Village</span>
          <span class="legend-item"><span class="dot port"></span>Port</span>
        </div>
        <div class="legend-toggles" id="mapToggles">
          <label><input id="tGrid"  type="checkbox" checked> Grid</label>
          <label><input id="tRiv"   type="checkbox" checked> Rivers</label>
          <label><input id="tLakes" type="checkbox" checked> Lakes</label>
          <label><input id="tRoads" type="checkbox" checked> Roads</label>
          <label><input id="tSet"   type="checkbox" checked> Settlements</label>
        </div>
      </div>`;
    return b;
  });

  // Close button toggles handled by mvp3 hotkey, but wire the button too:
  top.querySelector('#mapCloseBtn')?.addEventListener('click', () => {
    root.classList.add('hidden');
  });

  // -------- state --------
  const state = {
    devMode: !!devMode,
    shard: null,
    gridW: 0, gridH: 0,
    pos: { x: 0, y: 0 },
    tile: { w: 8, h: 8 },
    title: 'World Map',
  };

  // -------- utils --------
  const gctx = gridCanvas.getContext('2d');
  const fctx = fxCanvas.getContext('2d');
  const pctx = poiCanvas.getContext('2d');

  function fitCanvases() {
    // Match canvases to the .map-box rendered size (device pixels)
    const { width, height } = box.getBoundingClientRect();
    for (const c of [gridCanvas, fxCanvas, poiCanvas]) {
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.floor(width * ratio));
      c.height = Math.max(1, Math.floor(height * ratio));
      c.style.width = `${Math.floor(width)}px`;
      c.style.height = `${Math.floor(height)}px`;
      (c.getContext('2d')).setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    // compute tile size
    state.tile.w = Math.max(4, Math.floor(gridCanvas.width / (window.devicePixelRatio || 1) / Math.max(1, state.gridW)));
    state.tile.h = Math.max(4, Math.floor(gridCanvas.height / (window.devicePixelRatio || 1) / Math.max(1, state.gridH)));
  }
  const px = (x) => x * state.tile.w;
  const py = (y) => y * state.tile.h;
  const cx = (x) => x * state.tile.w + state.tile.w / 2;
  const cy = (y) => y * state.tile.h + state.tile.h / 2;

  // -------- public API --------
  function setTitle(text) {
    state.title = String(text || 'World Map');
    const el = top.querySelector('.map-title');
    if (el) el.textContent = state.title;
  }
  function setShard(shard) {
    state.shard = shard || null;
    const g = shard?.grid || [];
    state.gridH = g.length;
    state.gridW = g[0]?.length || 0;
    fitCanvases();
    render();
  }
  function setPos(x, y) {
    state.pos.x = x | 0;
    state.pos.y = y | 0;
    render();
  }

  // -------- colors (atlas) --------
  const biomeColor = (id)=>{
    switch(String(id).toLowerCase()){
      case 'ocean':return '#0b3a74';
      case 'coast': case 'beach': return '#d9c38c';
      case 'plains':return '#91c36e';
      case 'forest':return '#2e7d32';
      case 'hills':return '#97b06b';
      case 'mountains':return '#8e3c3c';
      case 'tundra':return '#b2c2c2';
      case 'desert':return '#e0c067';
      case 'wetland': case 'marsh': return '#8fae84';
      default:return '#7f93aa';
    }
  };
  const colors = {
    bg:'#0a1220', grid:'#233042',
    river:'#3aa2ff', riverGlow:'rgba(90,170,255,.35)',
    lake:'#2c6bb3', lakeEdge:'rgba(255,255,255,.2)',
    road:'#b79053', roadEdge:'#5a4a2a',
    city:'#ffd24a', town:'#ffef9f', village:'#d8f1a6', port:'#a6f1ff',
    label:'rgba(230,240,255,.95)', reticle:'#ff3a3a'
  };

  // -------- draw helpers --------
  function drawBiomes() {
    const g = state.shard?.grid; if (!g) return;
    fitCanvases();
    // base
    gctx.clearRect(0,0,gridCanvas.width, gridCanvas.height);
    gctx.fillStyle = colors.bg;
    gctx.fillRect(0,0,gridCanvas.width, gridCanvas.height);
    // cells
    for (let y=0;y<state.gridH;y++) {
      for (let x=0;x<state.gridW;x++) {
        gctx.fillStyle = biomeColor(g[y][x]);
        gctx.fillRect(px(x), py(y), state.tile.w, state.tile.h);
      }
    }
    // grid (toggle)
    const gridOn = bottom.querySelector('#tGrid')?.checked;
    if (gridOn) {
      gctx.save();
      gctx.globalAlpha = 0.25;
      gctx.strokeStyle = colors.grid;
      gctx.lineWidth = 1;
      gctx.beginPath();
      for (let x=0;x<=state.gridW;x++) { const X=px(x); gctx.moveTo(X,0); gctx.lineTo(X,py(state.gridH)); }
      for (let y=0;y<=state.gridH;y++) { const Y=py(y); gctx.moveTo(0,Y); gctx.lineTo(px(state.gridW),Y); }
      gctx.stroke();
      gctx.restore();
    }
  }

  function drawWaterRoads() {
    fctx.clearRect(0,0,fxCanvas.width, fxCanvas.height);

    // Lakes
    if (bottom.querySelector('#tLakes')?.checked) {
      const lakes = state.shard?.layers?.lakes;
      if (lakes) {
        fctx.save();
        fctx.fillStyle = colors.lake;
        fctx.strokeStyle = colors.lakeEdge;
        fctx.lineWidth = 1;
        if (Array.isArray(lakes.cells)) {
          for (const c of lakes.cells) {
            const x=(c.x??c[0])|0, y=(c.y??c[1])|0;
            fctx.fillRect(px(x),py(y),state.tile.w,state.tile.h);
            fctx.strokeRect(px(x)+.5,py(y)+.5,state.tile.w-1,state.tile.h-1);
          }
        }
        if (Array.isArray(lakes.polygons)) {
          for (const poly of lakes.polygons) {
            const pts=(poly||[]).map(p=>[(p.x??p[0])|0,(p.y??p[1])|0]); if (pts.length<3) continue;
            fctx.beginPath(); fctx.moveTo(px(pts[0][0]),py(pts[0][1]));
            for (let i=1;i<pts.length;i++) fctx.lineTo(px(pts[i][0]),py(pts[i][1]));
            fctx.closePath(); fctx.fill(); fctx.stroke();
          }
        }
        fctx.restore();
      }
    }

    // Rivers
    if (bottom.querySelector('#tRiv')?.checked) {
      const rivers = state.shard?.layers?.rivers?.paths;
      if (Array.isArray(rivers) && rivers.length) {
        const s=Math.max(1.2,state.tile.w*.14);
        fctx.save();
        fctx.lineJoin='round'; fctx.lineCap='round';
        fctx.strokeStyle = colors.riverGlow; fctx.lineWidth = s*3; for (const p of rivers) path(p);
        fctx.strokeStyle = colors.river;     fctx.lineWidth = s*1.6; for (const p of rivers) path(p);
        fctx.restore();
      }
    }

    // Roads + Bridges
    if (bottom.querySelector('#tRoads')?.checked) {
      const roads = state.shard?.layers?.roads?.paths;
      if (Array.isArray(roads) && roads.length) {
        const w=Math.max(1.5,state.tile.w*.18);
        fctx.save();
        fctx.lineJoin='round'; fctx.lineCap='round';
        fctx.strokeStyle=colors.roadEdge; fctx.globalAlpha=.35; fctx.lineWidth=w*2.2; for(const p of roads) path(p);
        fctx.strokeStyle=colors.road;     fctx.globalAlpha=.95; fctx.lineWidth=w;     for(const p of roads) path(p);
        fctx.restore();
      }
      const bridges = state.shard?.layers?.bridges;
      if (Array.isArray(bridges) && bridges.length) {
        fctx.save();
        for (const b of bridges) {
          const x=(b.x??b[0])|0, y=(b.y??b[1])|0;
          const pad=Math.max(1,Math.floor(state.tile.w*.18));
          fctx.fillStyle = '#e6d4a8';
          fctx.strokeStyle = '#3b3422';
          const bx=px(x)+pad, by=py(y)+pad, bw=state.tile.w-2*pad, bh=state.tile.h-2*pad;
          fctx.fillRect(bx,by,bw,bh); fctx.strokeRect(bx+.5,by+.5,bw-1,bh-1);
        }
        fctx.restore();
      }
    }

    function path(p){ if(!Array.isArray(p)||p.length<2) return;
      fctx.beginPath(); fctx.moveTo(cx(p[0][0]|0), cy(p[0][1]|0));
      for(let i=1;i<p.length;i++) fctx.lineTo(cx(p[i][0]|0), cy(p[i][1]|0));
      fctx.stroke();
    }
  }

  function drawSettlements() {
    pctx.clearRect(0,0,poiCanvas.width, poiCanvas.height);
    if (!bottom.querySelector('#tSet')?.checked) return;

    // collect groups
    const lay = state.shard?.layers?.settlements || {};
    const groups = {
      cities:   arr(lay.cities),
      towns:    arr(lay.towns),
      villages: arr(lay.villages),
      ports:    arr(lay.ports),
    };
    if (!groups.cities.length && !groups.towns.length && !groups.villages.length && !groups.ports.length) {
      const sites = Array.isArray(state.shard?.sites) ? state.shard.sites : [];
      for (const s of sites) {
        const type = String(s.type || '').toLowerCase();
        (groups[type+'s'] ||= []).push({ x:s.x, y:s.y, name:s.name, type });
      }
    }

    const draw = (pts, core, glowIn) => {
      const r = Math.max(3, Math.floor(state.tile.w * 0.35));
      for (const s of pts) {
        const X = cx((s.x ?? s[0])|0), Y = cy((s.y ?? s[1])|0);
        // glow
        const g = pctx.createRadialGradient(X, Y, 1, X, Y, r * 2.0);
        g.addColorStop(0, glowIn); g.addColorStop(1, 'rgba(255,255,255,0)');
        pctx.fillStyle = g; pctx.beginPath(); pctx.arc(X, Y, r * 2.0, 0, Math.PI*2); pctx.fill();
        // core
        pctx.fillStyle = core; pctx.beginPath(); pctx.arc(X, Y, r, 0, Math.PI*2); pctx.fill();
        // label
        const label = s.name || s.label;
        if (label && state.tile.w >= 8) {
          pctx.font = '12px ui-sans-serif, system-ui, Segoe UI, Roboto';
          pctx.textBaseline = 'top';
          pctx.fillStyle = colors.label;
          pctx.fillText(label, X + r + 3, Y - r - 1);
        }
      }
    };

    pctx.save();
    draw(groups.cities,   colors.city,   'rgba(255,220,120,.80)');
    draw(groups.towns,    colors.town,   'rgba(255,240,160,.70)');
    draw(groups.villages, colors.village,'rgba(220,255,160,.65)');
    draw(groups.ports,    colors.port,   'rgba(150,220,255,.70)');
    pctx.restore();
  }

  function drawReticle() {
    const x = px(state.pos.x), y = py(state.pos.y);
    pctx.save();
    pctx.strokeStyle = colors.reticle;
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x, y + state.tile.h/2);
    pctx.lineTo(x + state.tile.w, y + state.tile.h/2);
    pctx.moveTo(x + state.tile.w/2, y);
    pctx.lineTo(x + state.tile.w/2, y + state.tile.h);
    pctx.stroke();
    pctx.restore();
  }

  function render() {
    drawBiomes();
    drawWaterRoads();
    drawSettlements();
    drawReticle();
  }

  // -------- events --------
  window.addEventListener('resize', () => {
    if (root.classList.contains('hidden')) return;
    fitCanvases(); render();
  });
  bottom.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) render();
  });

  // passive updates from game
  window.addEventListener('game:moved', (ev)=>{ const d=ev.detail||{}; if(Number.isFinite(d.x)&&Number.isFinite(d.y)) setPos(d.x,d.y); });

  // expose
  return { setShard, setPos, setTitle, setDev(v){state.devMode=!!v}, render };

  // helpers
  function ensure(parent, sel, maker) {
    const found = parent.querySelector(sel);
    if (found) return found;
    const node = maker();
    parent.appendChild(node);
    return node;
  }
  function arr(a){ return Array.isArray(a) ? a : []; }
  function stub(){ return { setShard(){}, setPos(){}, setTitle(){}, setDev(){}, render(){} }; }
}
