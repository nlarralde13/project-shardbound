// /static/js/overlayMap.js — ensures scaffold exists, removes top legend, footer legend at bottom
export function initOverlayMap({
  devMode = false,
  getBiomeColor = () => '#a0a0a0',
  getPoiClass   = () => 'poi',
  onTileClick   = null,
} = {}) {
  const overlay = document.getElementById('overlayMap');
  if (!overlay) return { setShard(){}, setPos(){}, setDev(){}, setToken(){}, setFullBoard(){}, render(){}, _syncToggles(){} };

  // ---------- Ensure map scaffold exists (and nuke old top legend) ----------
  function ensureScaffold() {
    let frame = overlay.querySelector('.map-frame');
    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'map-frame';
      overlay.appendChild(frame);
    }
    // Remove any legacy top legend rows
    frame.querySelectorAll('.map-legend').forEach(n => n.remove());

    // Map holder (fixed 640x640 via CSS)
    let holder = frame.querySelector('.map-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'map-holder';
      // Insert as first child so footer can append after
      frame.insertBefore(holder, frame.firstChild);
    }

    // Map box
    let box = holder.querySelector('.map-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'map-box';
      holder.appendChild(box);
    }

    // Mini grid
    let gridEl = box.querySelector('#miniGrid');
    if (!gridEl) {
      gridEl = document.createElement('div');
      gridEl.id = 'miniGrid';
      gridEl.className = 'mini-grid';
      box.appendChild(gridEl);
    }

    // FX canvas
    let fx = box.querySelector('#mapFX');
    if (!fx) {
      fx = document.createElement('canvas');
      fx.id = 'mapFX';
      box.appendChild(fx);
    }

    // POI layer
    let poiEl = box.querySelector('#mapPOI');
    if (!poiEl) {
      poiEl = document.createElement('div');
      poiEl.id = 'mapPOI';
      box.appendChild(poiEl);
    }

    return { frame, holder, box, gridEl, fx, poiEl };
  }

  // Footer (legend + toggles) — build it once if missing
  let toggles = null, tHydro = null, tPOI = null;
  function ensureFooter(frame) {
    let footer = frame.querySelector('.map-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'map-footer';
      footer.innerHTML = `
        <div class="legend">
          <span class="legend-item"><i class="dot port"></i> Port</span>
          <span class="legend-item"><i class="dot village"></i> Village</span>
          <span class="legend-item"><i class="swatch road"></i> Road</span>
          <span class="legend-item"><i class="swatch river"></i> River</span>
        </div>
        <div id="mapToggles" class="${devMode ? '' : 'hidden'}">
          <label><input type="checkbox" id="toggleHydro" checked> Hydrology</label>
          <label><input type="checkbox" id="togglePOI" checked> POIs</label>
        </div>
        <div class="map-hint">Press M or ESC to close.</div>`;
      frame.appendChild(footer);
    }
    toggles = footer.querySelector('#mapToggles');
    tHydro  = footer.querySelector('#toggleHydro');
    tPOI    = footer.querySelector('#togglePOI');
  }

  // Build scaffold first, then footer, then grab drawing refs
  const { frame, box, gridEl, fx, poiEl } = ensureScaffold();
  ensureFooter(frame);
  const ctx = fx.getContext('2d');

  // Player token pin
  const tokenEl = document.createElement('div');
  tokenEl.id = 'mapYou';
  tokenEl.title = 'You';
  poiEl.appendChild(tokenEl);

  // ---------- State ----------
  const state = {
    shard: null,
    pos: { x: 8, y: 8 },
    devMode: !!devMode,
    view: { vx: 0, vy: 0, vw: 16, vh: 16, W: 16, H: 16 },
    token: { raw: '', short: '' },
    fullBoard: true, // show whole shard; CSS locks canvas to 640×640
  };
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

  function biomeAt(x, y) {
    const S = state.shard;
    if (!S) return 'Forest';
    const [W, H] = S.size || [0, 0];
    if (x < 0 || y < 0 || x >= W || y >= H) return 'Coast';
    return S.grid?.[y]?.[x] ?? 'Coast';
  }

  // ---------- Data helpers ----------
  function getHydrology() {
    const lay = state.shard?.layers || {};
    const h = lay.hydrology || lay.water || {};
    return { rivers: h.rivers || h.streams || [], lakes: h.lakes || h.ponds || [] };
  }
  function getRoads() {
    const r = state.shard?.layers?.roads || {};
    return { paths: r.paths || [], bridges: r.bridges || [] };
  }
  function getSettlements() {
    const S = state.shard?.layers?.settlements || {};
    const norm = (arr, type) => (arr || []).map(p => ({ x: p.x ?? p[0], y: p.y ?? p[1], type }));
    const fromLayers = [
      ...norm(S.cities,   'city'),
      ...norm(S.towns,    'town'),
      ...norm(S.villages, 'village'),
      ...norm(S.ports,    'port'),
    ];
    const fromSites = (state.shard?.sites || []).map(s => ({
      x: s.x ?? s.pos?.[0], y: s.y ?? s.pos?.[1], type: s.type, name: s.name
    }));
    const fromPois  = (state.shard?.pois  || []).map(p => ({
      x: p.x, y: p.y, type: p.type || 'poi', name: p.name
    }));
    const seen = new Set(), out = [];
    [...fromLayers, ...fromSites, ...fromPois].forEach(o => {
      if (o.x == null || o.y == null) return;
      const k = `${o.type}:${o.x},${o.y}`;
      if (!seen.has(k)) { seen.add(k); out.push(o); }
    });
    return out;
  }

  // ---------- View + layout ----------
  function computeView() {
    const S = state.shard;
    const W = Number(S?.size?.[0] ?? 32);
    const H = Number(S?.size?.[1] ?? 32);
    if (state.fullBoard || state.devMode) { state.view = { vx:0, vy:0, vw:W, vh:H, W,H }; return; }
    const vw = Math.min(16, W), vh = Math.min(16, H);
    const vx = clamp(state.pos.x - Math.floor(vw/2), 0, Math.max(0, W - vw));
    const vy = clamp(state.pos.y - Math.floor(vh/2), 0, Math.max(0, H - vh));
    state.view = { vx, vy, vw, vh, W, H };
  }

  function layoutBox() {
    const { vw, vh } = state.view;
    const width  = box.clientWidth;
    const height = box.clientHeight;
    gridEl.style.gridTemplateColumns = `repeat(${vw}, 1fr)`;
    gridEl.style.gridTemplateRows    = `repeat(${vh}, 1fr)`;
    if (fx && ctx) { fx.width = width; fx.height = height; ctx.clearRect(0, 0, width, height); }
  }

  function renderGrid() {
    const { vx, vy, vw, vh } = state.view;
    gridEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let y = vy; y < vy + vh; y++) {
      for (let x = vx; x < vx + vw; x++) {
        const d = document.createElement('div');
        d.className = 'cell';
        const b = biomeAt(x, y);
        d.style.background = getBiomeColor(b);
        d.title = `${b} (${x},${y})`;
        if (typeof onTileClick === 'function') d.addEventListener('click', () => onTileClick(x, y));
        frag.appendChild(d);
      }
    }
    gridEl.appendChild(frag);
    const lx = state.pos.x - vx, ly = state.pos.y - vy;
    if (lx >= 0 && ly >= 0 && lx < vw && ly < vh) gridEl.children[ly * vw + lx]?.classList.add('here');
  }

  // ---------- Layers ----------
  function renderHydrology() {
    if (!ctx) return;
    ctx.clearRect(0, 0, fx.width, fx.height);
    const show = state.devMode ? !!tHydro?.checked : true;
    if (!show) return;
    const { vx, vy, vw, vh } = state.view;
    const cw = fx.width / vw, ch = fx.height / vh;
    const { rivers, lakes } = getHydrology();

    ctx.fillStyle = 'rgba(40,140,220,0.22)';
    lakes?.forEach(L => {
      const p = Array.isArray(L) ? L : (L?.pos || [L?.x, L?.y]);
      const [x, y] = p || [];
      if (x == null || y == null) return;
      if (x < vx || y < vy || x >= vx + vw || y >= vy + vh) return;
      ctx.fillRect((x - vx) * cw, (y - vy) * ch, cw, ch);
    });

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(30,120,210,0.9)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(cw, ch) * 0.18));
    rivers?.forEach(r => {
      const pts = r?.path || r?.points || r?.coords || r;
      if (!Array.isArray(pts) || pts.length < 2) return;
      ctx.beginPath();
      let first = true;
      for (const p of pts) {
        const q = Array.isArray(p) ? p : (p?.pos || [p?.x, p?.y]);
        const [x, y] = q || [];
        if (x == null || y == null) continue;
        const cx = (x - vx) * cw + cw * 0.5, cy = (y - vy) * ch + ch * 0.5;
        if (first) { ctx.moveTo(cx, cy); first = false; } else { ctx.lineTo(cx, cy); }
      }
      ctx.stroke();
    });
  }

  function renderRoads() {
    if (!ctx || !fx) return;
    const { vx, vy, vw, vh } = state.view;
    const { paths, bridges } = getRoads();
    const cw = fx.width / vw, ch = fx.height / vh;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(245,215,122,0.95)'; // road gold
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(cw, ch) * 0.22));

    paths?.forEach(seg => {
      if (!Array.isArray(seg) || seg.length < 2) return;
      ctx.beginPath();
      let first = true;
      for (const p of seg) {
        const [x, y] = Array.isArray(p) ? p : [p?.x, p?.y];
        if (x == null || y == null) continue;
        const cx = (x - vx) * cw + cw * 0.5;
        const cy = (y - vy) * ch + ch * 0.5;
        if (first) { ctx.moveTo(cx, cy); first = false; } else { ctx.lineTo(cx, cy); }
      }
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(245,215,122,0.95)';
    bridges?.forEach(b => {
      const [x, y] = Array.isArray(b) ? b : [b?.x, b?.y];
      if (x == null || y == null) return;
      if (x < vx || y < vy || x >= vx + vw || y >= vy + vh) return;
      ctx.fillRect((x - vx) * cw + cw * 0.25, (y - vy) * ch + ch * 0.25, cw * 0.5, ch * 0.5);
    });
  }

  function renderPOI() {
    poiEl.querySelectorAll('.poi').forEach(n => n.remove());
    const show = state.devMode ? !!tPOI?.checked : true;
    if (!show) return;
    const { vx, vy, vw, vh } = state.view;
    const cw = box.clientWidth / vw, ch = box.clientHeight / vh;

    getSettlements().forEach(s => {
      const x = s.x, y = s.y;
      if (x < vx || y < vy || x >= vx + vw || y >= vy + vh) return;
      const el = document.createElement('div');
      el.className = getPoiClass(s.type);
      el.classList.add('poi');
      el.style.position = 'absolute';
      el.style.left = `${(x - vx) * cw + (cw / 2) - 7}px`;
      el.style.top  = `${(y - vy) * ch + (ch / 2) - 7}px`;
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.title = s.name || s.type;
      poiEl.appendChild(el);
    });
  }

  function positionToken() {
    const { vx, vy, vw, vh } = state.view;
    const cw = box.clientWidth / vw, ch = box.clientHeight / vh;
    const lx = state.pos.x - vx, ly = state.pos.y - vy;
    if (lx < 0 || ly < 0 || lx >= vw || ly >= vh) { tokenEl.style.display = 'none'; return; }
    tokenEl.style.display = 'grid';
    tokenEl.style.left = `${lx * cw + (cw / 2) - 7}px`;
    tokenEl.style.top  = `${ly * ch + (ch / 2) - 7}px`;
    tokenEl.textContent = state.token.short || '•';
    tokenEl.title = state.token.raw || 'You';
  }

  function render() {
    layoutBox();
    renderGrid();
    renderHydrology();
    renderRoads();
    renderPOI();
    positionToken();
  }

  // ---------- Public API ----------
  function setShard(s){ state.shard = s || null; computeView(); render(); }
  function setPos(x,y){ state.pos = { x:Number(x)||0, y:Number(y)||0 }; computeView(); if(!overlay.classList.contains('hidden')) render(); }
  function setDev(on){ state.devMode = !!on; toggles?.classList.toggle('hidden', !state.devMode); computeView(); render(); }
  function setToken(token){ const raw=String(token||''); const tail=raw.slice(-5); state.token={raw,short:tail}; positionToken(); }
  function setFullBoard(on){ state.fullBoard = !!on; computeView(); render(); }
  function _syncToggles(){ toggles?.classList.toggle('hidden', !state.devMode); }

  // Events
  window.addEventListener('resize', () => {
    if (!overlay.classList.contains('hidden')) { layoutBox(); renderHydrology(); renderPOI(); positionToken(); }
  });
  tHydro?.addEventListener('change', () => { renderHydrology(); renderRoads(); });
  tPOI?.addEventListener('change',   () => { renderPOI(); });

  return { setShard, setPos, setDev, setToken, setFullBoard, render, _syncToggles };
}
