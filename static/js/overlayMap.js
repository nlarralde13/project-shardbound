// /static/js/overlayMap.js — dynamic full-board view + moving token
export function initOverlayMap({
  devMode = false,
  getBiomeColor = () => '#a0a0a0',
  getPoiClass   = () => 'poi',
  onTileClick   = null,
} = {}) {
  const overlay = document.getElementById('overlayMap');
  const holder  = document.getElementById('mapHolder');     // optional; CSS will size if absent
  const box     = overlay?.querySelector('.map-box');
  const gridEl  = document.getElementById('miniGrid');
  const poiEl   = document.getElementById('mapPOI');
  const fx      = document.getElementById('mapFX');
  const ctx     = fx?.getContext('2d') || null;

  const toggles = document.getElementById('mapToggles');
  const tHydro  = document.getElementById('toggleHydro');
  const tPOI    = document.getElementById('togglePOI');

  // A dedicated element for the local player's token
  const tokenEl = document.createElement('div');
  tokenEl.id = 'mapYou';
  tokenEl.style.position = 'absolute';
  tokenEl.style.zIndex = '4';
  tokenEl.style.width = '14px';
  tokenEl.style.height = '14px';
  tokenEl.style.borderRadius = '50%';
  tokenEl.style.display = 'grid';
  tokenEl.style.placeItems = 'center';
  tokenEl.style.fontSize = '9px';
  tokenEl.style.fontWeight = '700';
  tokenEl.style.color = '#0b0f16';
  tokenEl.style.background = 'linear-gradient(#ffd87a,#ffbd52)';
  tokenEl.style.boxShadow = '0 0 0 1px rgba(0,0,0,.45), 0 0 8px rgba(0,0,0,.25)';
  tokenEl.title = 'You';
  // attach now so it exists even before first render
  poiEl?.appendChild(tokenEl);

  const state = {
    shard: null,
    pos: { x: 8, y: 8 },
    devMode: !!devMode,
    view: { vx: 0, vy: 0, vw: 16, vh: 16, W: 16, H: 16 },
    token: { raw: '', short: '' },
    fullBoard: true, // show full W×H by default per your request
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cssTileSize = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--tile-size')
      .trim();
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  function biomeAt(x, y) {
    const S = state.shard;
    if (!S) return 'Forest';
    const [W, H] = S.size || [0, 0];
    if (x < 0 || y < 0 || x >= W || y >= H) return 'Coast';
    return S.grid?.[y]?.[x] ?? 'Coast';
  }

  function getHydrology() {
    const lay = state.shard?.layers || {};
    const h = lay.hydrology || lay.water || {};
    return { rivers: h.rivers || h.streams || [], lakes: h.lakes || h.ponds || [] };
  }

  // View computation: full board (W×H) if fullBoard or devMode, else 16×16 centered window
  function computeView() {
    const S = state.shard;
    const W = Number(S?.size?.[0] ?? 32);
    const H = Number(S?.size?.[1] ?? 32);

    if (state.fullBoard || state.devMode) {
      state.view = { vx: 0, vy: 0, vw: W, vh: H, W, H };
      return;
    }
    const vw = Math.min(16, W), vh = Math.min(16, H);
    const vx = clamp(state.pos.x - Math.floor(vw / 2), 0, Math.max(0, W - vw));
    const vy = clamp(state.pos.y - Math.floor(vh / 2), 0, Math.max(0, H - vh));
    state.view = { vx, vy, vw, vh, W, H };
  }

  // Size the visual box to match the current view and tile size
  function layoutBox() {
    const { vw, vh } = state.view;
    const width = box.clientWidth;
    const height = box.clientHeight;
    gridEl.style.gridTemplateColumns = `repeat(${vw}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${vh}, 1fr)`;
    if (fx && ctx) { fx.width = width; fx.height = height; ctx.clearRect(0,0,width,height); }
  }
    /* if (!box || !gridEl) return;
    
    const w = (holder?.clientWidth || box.clientWidth || 1200);
    const h = (holder?.clientHeight || box.clientHeight || 720);
    const ts = cssTileSize();
    const width  = ts ? vw * ts : w;
    const height = ts ? vh * ts : h;

    box.style.width  = width + 'px';
    box.style.height = height + 'px';

    gridEl.style.gridTemplateColumns = `repeat(${vw}, 1fr)`;
    gridEl.style.gridTemplateRows    = `repeat(${vh}, 1fr)`;

    if (fx && ctx) {
      fx.width = width;
      fx.height = height;
      ctx.clearRect(0, 0, width, height);
    }
    if (poiEl) {
      poiEl.style.width = width + 'px';
      poiEl.style.height = height + 'px';
    }
  } */

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

    // Keep the "here" class for extra clarity underneath the token
    const lx = state.pos.x - vx, ly = state.pos.y - vy;
    if (lx >= 0 && ly >= 0 && lx < vw && ly < vh) gridEl.children[ly * vw + lx]?.classList.add('here');
  }

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

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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

  function renderPOI() {
    // Keep existing POIs
    poiEl.querySelectorAll('.poi').forEach(n => n.remove());

    const show = state.devMode ? !!tPOI?.checked : true;
    if (!show) return;

    const { vx, vy, vw, vh } = state.view;
    const cw = box.clientWidth / vw, ch = box.clientHeight / vh;

    (state.shard?.sites || []).forEach(s => {
      const [x, y] = s.pos || [s.x, s.y];
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
    if (!poiEl || !tokenEl) return;
    const { vx, vy, vw, vh } = state.view;
    const cw = box.clientWidth / vw, ch = box.clientHeight / vh;
    const lx = state.pos.x - vx, ly = state.pos.y - vy;
    if (lx < 0 || ly < 0 || lx >= vw || ly >= vh) {
      tokenEl.style.display = 'none';
      return;
    }
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
    renderPOI();
    positionToken();
  }

  // === Public API ===
  function setShard(s) {
    state.shard = s || null;
    computeView();
    render();
  }
  function setPos(x, y) {
    state.pos = { x: Number(x) || 0, y: Number(y) || 0 };
    computeView();
    if (!overlay.classList.contains('hidden')) render();
  }
  function setDev(on) {
    state.devMode = !!on;
    toggles?.classList.toggle('hidden', !state.devMode);
    computeView();
    render();
  }
  function setToken(token) {
    const raw = String(token || '');
    // display a tiny, legible suffix like "...45594"
    const tail = raw.slice(-5);
    state.token = { raw, short: tail };
    positionToken();
  }
  function setFullBoard(on) {
    state.fullBoard = !!on;
    computeView();
    render();
  }
  function _syncToggles() { toggles?.classList.toggle('hidden', !state.devMode); }

  window.addEventListener('resize', () => {
    if (!overlay.classList.contains('hidden')) {
      layoutBox(); renderHydrology(); renderPOI(); positionToken();
    }
  });
  document.getElementById('toggleHydro')?.addEventListener('change', () => { renderHydrology(); });
  document.getElementById('togglePOI')?.addEventListener('change', () => { renderPOI(); });

  return { setShard, setPos, setDev, setToken, setFullBoard, render, _syncToggles };
}
