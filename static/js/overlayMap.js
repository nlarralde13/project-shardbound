// overlayMap.js — image tiles + settlements precedence + dev debug overlay
// Styling lives in /static/css/mapOverlay.css
// API: initOverlayMap({ devMode })
//   .setShard(shard)  // expects .tiles plus optional .layers.* and/or .sites/.pois
//   .setPos(x,y), .setTitle(text), .render()

import { colorForSettlement } from '/static/js/settlementRegistry.js';

export function initOverlayMap({ devMode = false } = {}) {
  const root = document.getElementById('overlayMap');
  if (!root) return stub();

  root.classList.add('overlay');

  // scaffold
  const panel  = ensure(root, '.map-panel', () => { const p=document.createElement('div'); p.className='map-panel'; return p; });
  const top    = ensure(panel, '.map-top', () => { const t=document.createElement('header'); t.className='map-top'; t.innerHTML = `<div class="map-title">World Map</div>`; return t; });
  const frame  = ensure(panel, '.map-frame', () => { const f=document.createElement('section'); f.className='map-frame'; return f; });
  const holder = ensure(frame, '.map-holder', () => { const d=document.createElement('div'); d.className='map-holder'; return d; });
  const box    = ensure(holder, '.map-box', () => { const b=document.createElement('div'); b.className='map-box'; return b; });

  const gridCanvas = ensure(box, 'canvas.map-base', () => { const c=document.createElement('canvas'); c.className='map-base'; c.width=640; c.height=640; return c; });
  const fxCanvas   = ensure(box, 'canvas#mapFX', () => { const c=document.createElement('canvas'); c.id='mapFX';   c.width=640; c.height=640; return c; });
  const poiCanvas  = ensure(box, 'canvas#mapPOI', () => { const c=document.createElement('canvas'); c.id='mapPOI'; c.width=640; c.height=640; return c; });

  const POI_BASE = '/static/assets/2d/minimap/';
  const bottom = ensure(panel, '.map-bottom', () => {
    const b = document.createElement('footer'); b.className='map-bottom';
    b.innerHTML = `
      <div class="map-bottom__inner">
        <div class="legend-list">
          <span class="legend-item"><span class="swatch ocean"></span>Ocean</span>
          <span class="legend-item"><span class="swatch coast"></span>Coast</span>
          <span class="legend-item"><span class="swatch plains"></span>Plains</span>
          <span class="legend-item"><span class="swatch forest"></span>Forest</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}city_1.png" alt="City">City</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}town_1.png" alt="Town">Town</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}village_1.png" alt="Village">Village</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}port_1.png" alt="Port">Port</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}dungeon_1.png" alt="Dungeon">Dungeon</span>
          <span class="legend-item"><img class="legend-icon" src="${POI_BASE}volcano_1.png" alt="Volcano">Volcano</span>
        </div>
      </div>`;
    return b;
  });

  const state = {
    devMode: !!devMode,
    shard: null,
    gridW: 0, gridH: 0,
    pos: { x: 0, y: 0 },
    tile: { w: 8, h: 8 },
    title: '',
    pois: [],
    gates: [],
    discoveredGateIds: [],
  };

  const gctx = gridCanvas.getContext('2d');
  const fctx = fxCanvas.getContext('2d');
  const pctx = poiCanvas.getContext('2d');

  function fitCanvases() {
    const { width, height } = box.getBoundingClientRect();
    for (const c of [gridCanvas, fxCanvas, poiCanvas]) {
      const ratio = window.devicePixelRatio || 1;
      c.width  = Math.max(1, Math.floor(width  * ratio));
      c.height = Math.max(1, Math.floor(height * ratio));
      c.style.width  = `${Math.floor(width)}px`;
      c.style.height = `${Math.floor(height)}px`;
      (c.getContext('2d')).setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    state.tile.w = Math.max(4, Math.floor((gridCanvas.width  / (window.devicePixelRatio || 1)) / Math.max(1, state.gridW)));
    state.tile.h = Math.max(4, Math.floor((gridCanvas.height / (window.devicePixelRatio || 1)) / Math.max(1, state.gridH)));
  }
  const px = (x) => x * state.tile.w;
  const py = (y) => y * state.tile.h;
  const cx = (x) => x * state.tile.w + state.tile.w / 2;
  const cy = (y) => y * state.tile.h + state.tile.h / 2;

  function setTitle(text) {
    state.title = String(text || '');
    const el = top.querySelector('.map-title');
    if (el) el.textContent = state.title ? `World Map; ${state.title}` : 'World Map';
  }
  function setShard(shard) {
    state.shard = shard || null;
    const g = shard?.tiles || [];
    state.gridH = g.length;
    state.gridW = g[0]?.length || 0;
    state.pois = Array.isArray(shard?.pois) ? shard.pois : (Array.isArray(shard?.sites) ? shard.sites : []);
    // shardgates layer (optional)
    const nodes = shard?.layers?.shardgates?.nodes;
    state.gates = Array.isArray(nodes) ? nodes.map(n => ({ id: String(n.id||''), link: String(n.link||''), x: (n.x|0), y: (n.y|0) })) : [];
    if (shard?.name) setTitle(shard.name);
    fitCanvases();
    preloadTilesForGrid();
    render();
    // Fetch discovered gates for current character
    fetch('/api/discoveries').then(r=>r.json()).then(j=>{
      const list = Array.isArray(j?.shardgates) ? j.shardgates : [];
      state.discoveredGateIds = list.map(String);
      render();
    }).catch(()=>{});
  }
  function setPos(x, y) { state.pos.x = x|0; state.pos.y = y|0; render(); }

  // ---- TILE IMAGE ATLAS ----
  // Your atlas lives here (matches your tree)
  const TILE_BASE = '/static/assets/2d/overlayMap/';

  // token → filename (without .png)
  function tokenToKey(token) {
    const lc = String(token || '').toLowerCase();

    // settlements take precedence
    if (lc === 'city')    return 'town_city';
    if (lc === 'port')    return 'town_port';
    if (lc === 'village') return 'town_village';
    if (lc === 'town')    return 'town_village'; // share tile for now

    // biomes
    if (lc === 'ocean') return 'biome_ocean';
    if (lc === 'plains' || lc === 'plain' || lc === 'grass' || lc === 'coast' || lc === 'beach') return 'biome_plains';
    if (lc === 'forest' || lc === 'woods') return 'biome_forest';

    return 'default_room'; // mountains, hills, marsh, tundra, etc. fallback
  }

  const tileAtlas = new Map();
  const pendingLoads = new Set();
  function getTileImage(key) {
    const cached = tileAtlas.get(key);
    if (cached) return cached;
    const img = new Image();
    tileAtlas.set(key, img);
    if (!pendingLoads.has(key)) {
      pendingLoads.add(key);
      img.onload = () => { pendingLoads.delete(key); render(); };
      img.onerror = () => { pendingLoads.delete(key); if (key !== 'default_room') { tileAtlas.set(key, getTileImage('default_room')); render(); } };
      img.src = `${TILE_BASE}${key}.png`;
    }
    return img;
  }

  function preloadTilesForGrid() {
    const g = state.shard?.tiles || [];
    const wanted = new Set();
    for (let y=0;y<g.length;y++) for (let x=0;x<(g[0]?.length||0);x++) wanted.add(tokenToKey(g[y][x]));
    wanted.add('default_room');
    for (const k of wanted) getTileImage(k);
  }

  // ---- draw layers ----
  function drawBiomes() {
    const g = state.shard?.tiles; if (!g) return;
    fitCanvases();
    gctx.clearRect(0,0,gridCanvas.width, gridCanvas.height);

    for (let y=0;y<state.gridH;y++) {
      for (let x=0;x<state.gridW;x++) {
        const key = tokenToKey(g[y][x]);
        const img = getTileImage(key);
        if (img && img.complete && img.naturalWidth > 0) {
          gctx.drawImage(img, px(x), py(y), state.tile.w, state.tile.h);
        }
      }
    }

    // subtle grid lines
    gctx.save();
    gctx.globalAlpha = 0.25;
    gctx.strokeStyle = '#233042';
    gctx.lineWidth = 1;
    gctx.beginPath();
    for (let x=0;x<=state.gridW;x++) { const X=px(x); gctx.moveTo(X,0); gctx.lineTo(X,py(state.gridH)); }
    for (let y=0;y<=state.gridH;y++) { const Y=py(y); gctx.moveTo(0,Y); gctx.lineTo(px(state.gridW),Y); }
    gctx.stroke();
    gctx.restore();
  }

  function drawWaterRoads() {
    fctx.clearRect(0,0,fxCanvas.width, fxCanvas.height);

    const lakes = state.shard?.layers?.lakes;
    if (lakes) {
      fctx.save();
      fctx.fillStyle = '#2c6bb3';
      fctx.strokeStyle = 'rgba(255,255,255,.2)';
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

    if (!state.devMode) return;
    
    const rivers = state.shard?.layers?.rivers?.paths || state.shard?.layers?.hydrology?.rivers;
    if (Array.isArray(rivers) && rivers.length) {
      const s=Math.max(1.2,state.tile.w*.14);
      fctx.save();
      fctx.lineJoin='round'; fctx.lineCap='round';
      fctx.strokeStyle = 'rgba(90,170,255,.35)'; fctx.lineWidth = s*3; for (const p of rivers) path(p);
      fctx.strokeStyle = '#3aa2ff';              fctx.lineWidth = s*1.6; for (const p of rivers) path(p);
      fctx.restore();
    }
    const roads = state.shard?.layers?.roads?.paths;
    if (Array.isArray(roads) && roads.length) {
      const w=Math.max(1.5,state.tile.w*.18);
      fctx.save();
      fctx.lineJoin='round'; fctx.lineCap='round';
      fctx.strokeStyle='#5a4a2a'; fctx.globalAlpha=.35; fctx.lineWidth=w*2.2; for(const p of roads) path(p);
      fctx.strokeStyle='#b79053'; fctx.globalAlpha=.95; fctx.lineWidth=w;     for(const p of roads) path(p);
      fctx.restore();
    }

    function path(p){ if(!Array.isArray(p)||p.length<2) return;
      fctx.beginPath(); fctx.moveTo(cx(p[0][0]|0), cy(p[0][1]|0));
      for(let i=1;i<p.length;i++) fctx.lineTo(cx(p[i][0]|0), cy(p[i][1]|0));
      fctx.stroke();
    }
  }

  // POI icons (unchanged)
  const poiImgs = {}; const poiVariantCache = new Map();
  const poiTypes = ['town','village','dungeon','city','port','volcano'];
  for (const t of poiTypes) {
    poiImgs[t] = [];
    for (let i=1;i<=3;i++) {
      const img = new Image();
      img.onload = () => { poiImgs[t].push(img); render(); };
      img.src = `${POI_BASE}${t}_${i}.png`;
    }
  }

  // Shardgate icon (optional PNG); fall back to vector glyph if missing
  const gateIcon = new Image();
  gateIcon.onload = () => render();
  gateIcon.onerror = () => { /* keep vector fallback */ };
  gateIcon.src = `${TILE_BASE}shardgate.png`;

  function drawPOI() {
    pctx.clearRect(0,0,poiCanvas.width, poiCanvas.height);
    for (const s of state.pois) {
      const type = String(s.type||'').toLowerCase();
      const imgs = poiImgs[type]; if (!imgs || !imgs.length) continue;
      const key = `${type}:${s.x},${s.y}`;
      let idx = poiVariantCache.get(key);
      if (idx == null) { idx = Math.floor(Math.random()*imgs.length); poiVariantCache.set(key, idx); }
      const img = imgs[idx] || imgs[0];
      const size = Math.min(state.tile.w, state.tile.h);
      const dx = px(s.x) + (state.tile.w - size)/2;
      const dy = py(s.y) + (state.tile.h - size)/2;
      pctx.drawImage(img, dx, dy, size, size);
    }
  }

  function drawShardgates() {
    if (!Array.isArray(state.gates) || state.gates.length === 0) return;
    for (const g of state.gates) {
      // Dev mode: always show. Normal: only discovered or current tile
      const isHere = (g.x === (state.pos.x|0) && g.y === (state.pos.y|0));
      if (!state.devMode) {
        if (!isHere && !state.discoveredGateIds.includes(g.id)) continue;
      }
      const size = Math.floor(Math.min(state.tile.w, state.tile.h) * 0.66);
      const dx = px(g.x) + (state.tile.w - size)/2;
      const dy = py(g.y) + (state.tile.h - size)/2;
      if (gateIcon && gateIcon.complete && gateIcon.naturalWidth > 0) {
        pctx.drawImage(gateIcon, dx, dy, size, size);
      } else {
        // fallback glyph: small magenta diamond
        const cx0 = dx + size/2, cy0 = dy + size/2, r = size/2;
        pctx.save();
        pctx.globalAlpha = 0.95;
        pctx.fillStyle = '#d16bff';
        pctx.strokeStyle = '#5a2a86';
        pctx.lineWidth = Math.max(1, size * 0.12);
        pctx.beginPath();
        pctx.moveTo(cx0, cy0 - r);
        pctx.lineTo(cx0 + r, cy0);
        pctx.lineTo(cx0, cy0 + r);
        pctx.lineTo(cx0 - r, cy0);
        pctx.closePath();
        pctx.fill();
        pctx.stroke();
        pctx.restore();
      }
    }
  }

  // Player token (boat when in ocean)
  const TOKEN_BASE = '/static/assets/2d/tokens/';
  const tokenImgs = { character: new Image(), boat: new Image() };
  tokenImgs.character.onload = () => render();
  tokenImgs.boat.onload = () => render();
  tokenImgs.character.src = `${TOKEN_BASE}character.png`;
  tokenImgs.boat.src = `${TOKEN_BASE}boat.png`;

  function drawPlayer() {
    const tileTok = state.shard?.tiles?.[state.pos.y]?.[state.pos.x];
    const isOcean = String(tileTok || '').toLowerCase() === 'ocean';
    const img = isOcean ? tokenImgs.boat : tokenImgs.character;
    if (!img.complete) return;
    const size = Math.min(state.tile.w, state.tile.h);
    const dx = px(state.pos.x) + (state.tile.w - size)/2;
    const dy = py(state.pos.y) + (state.tile.h - size)/2;
    pctx.drawImage(img, dx, dy, size, size);
  }

  // ---- DEV DEBUG OVERLAY (settlement dots + labels) ----
  function debugSettlementDots() {
    if (!state.devMode) return;
    const sets = (state.shard?.layers?.settlements) || {};
    const groups = [
      ['city', sets.cities],
      ['town', sets.towns],
      ['village', sets.villages],
      ['port', sets.ports],
    ];
    pctx.save();
    pctx.globalAlpha = 0.95;
    pctx.font = `${Math.max(10, Math.floor(state.tile.h * 0.8))}px monospace`;
    for (const [name, arr] of groups) {
      if (!Array.isArray(arr)) continue;
      pctx.fillStyle =
        name === 'city'   ? '#ffd24a' :
        name === 'port'   ? '#a6f1ff' :
        name === 'town'   ? '#ffef9f' : '#d8f1a6';
      for (const {x,y} of arr) {
        // Dot
        pctx.fillRect(px(x) + state.tile.w/3, py(y) + state.tile.h/3, 3, 3);
        // Label (slightly offset)
        pctx.fillText(name, px(x) + 2, py(y) + state.tile.h - 2);
      }
    }
    pctx.restore();
  }

  function render() {
    drawBiomes();
    drawWaterRoads();
    drawPOI();
    drawShardgates();
    debugSettlementDots(); // only paints when state.devMode === true
    drawPlayer();
  }

  // resize
  window.addEventListener('resize', () => {
    if (!root.classList.contains('hidden')) { fitCanvases(); render(); }
  });
  window.addEventListener('game:moved', (ev)=>{ const d=ev.detail||{}; if(Number.isFinite(d.x)&&Number.isFinite(d.y)) { setPos(d.x,d.y); refreshDiscoveries(); } });
  window.addEventListener('game:position', (ev)=>{ const d=ev.detail||{}; if(Number.isFinite(d.x)&&Number.isFinite(d.y)) { setPos(d.x,d.y); refreshDiscoveries(); } });

  async function refreshDiscoveries(){
    try{
      const j = await fetch('/api/discoveries').then(r=>r.json()).catch(()=>null);
      const list = Array.isArray(j?.shardgates) ? j.shardgates : [];
      const ids = list.map(String);
      // Only re-render when changed to avoid flicker
      const changed = ids.length !== state.discoveredGateIds.length || ids.some((id,i)=>id!==state.discoveredGateIds[i]);
      state.discoveredGateIds = ids;
      if (changed) render();
    }catch{}
  }

  return { setShard, setPos, setTitle, setDev(v){state.devMode=!!v; render();}, render };

  // helpers
  function ensure(parent, sel, maker) { const found = parent.querySelector(sel); if (found) return found; const node = maker(); parent.appendChild(node); return node; }
  function stub(){ return { setShard(){}, setPos(){}, setTitle(){}, setDev(){}, render(){} }; }
}
