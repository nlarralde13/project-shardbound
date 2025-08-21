// /static/js/shard-viewer-v2.js
(() => {
  // ---------- elements ----------
  const els = {
    base: document.getElementById("canvas"),
    frame: document.getElementById("frame"),
    panel: document.querySelector(".viewer .canvas-wrap"),
    select: document.getElementById("shardSelect"),
    loadBtn: document.getElementById("btnLoad"),
    // toggles
    biomes: document.getElementById("layerBiomes"),
    rivers: document.getElementById("layerRivers"),
    lakes: document.getElementById("layerLakes"),
    roads: document.getElementById("layerRoads"),
    bridges: document.getElementById("layerBridges"),
    poi: document.getElementById("layerPOI"),
    settlements: document.getElementById("layerSettlements"),
    ports: document.getElementById("layerPorts"),
    resources: document.getElementById("layerResources"),
    // viewer controls
    scale: document.getElementById("scale"),
    grid: document.getElementById("grid"),
    autoFit: document.getElementById("autoFit"),
    opacity: document.getElementById("overlayOpacity"),
    palette: document.getElementById("palette"),
    // zoom buttons
    btnFit: document.getElementById("btnFit"),
    btnZoomIn: document.getElementById("btnZoomIn"),
    btnZoomOut: document.getElementById("btnZoomOut"),
    // tooltip
    tip: document.getElementById("tooltip"),
    status: document.getElementById("status"),
  };
  if (!els.base || !els.frame) return;

  // --- debug switch: enable with ?debug or localStorage.SV2_DEBUG="1"
  const DEBUG = new URLSearchParams(location.search).has("debug") || localStorage.SV2_DEBUG === "1";
  const dbg = (...a) => { if (DEBUG) console.log(...a); };
  const warn = (...a) => { if (DEBUG) console.warn(...a); };
  const derr = (...a) => { if (DEBUG) console.error(...a); };

  // ---------- overlay canvas ----------
  const overlay = document.createElement("canvas");
  overlay.id = "overlayCanvasV2";
  els.frame.appendChild(overlay);
  const ctx = overlay.getContext("2d", { willReadFrequently: true });

  // ---------- state ----------
  const SV2 = (window.SV2 = window.SV2 || {});
  SV2.state = SV2.state || {
    shard: null,
    grid: null,           // 2D array of strings
    hidden: false,        // Alt hides overlays
    hover: { x: -1, y: -1 }
  };

  // ---------- helpers ----------
  const Palettes = {
    classic: { river:"#2d7bd2", lake:"#4aa3ff" },
    contrast:{ river:"#0055ff", lake:"#00c3ff" },
    pastel:  { river:"#5da7f5", lake:"#8cc9ff" },
    noir:    { river:"#6aa9ff", lake:"#9ec8ff" },
  };
  const dpr = () => (window.devicePixelRatio || 1);
  const setStatus = (m) => { if (els.status) els.status.textContent = m; };

  const looks2DArray = a => Array.isArray(a) && a.length && Array.isArray(a[0]);

  function normalize2DArrayToStrings(twoD){
    const out = new Array(twoD.length);
    for (let y=0; y<twoD.length; y++){
      const row = twoD[y], line = new Array(row.length);
      for (let x=0; x<row.length; x++){
        const cell = row[x];
        if (typeof cell === "string") line[x] = cell;
        else if (cell && typeof cell.biome === "string") line[x] = cell.biome;
        else if (cell && typeof cell.type  === "string") line[x] = cell.type;
        else if (cell && typeof cell.tag   === "string") line[x] = cell.tag;
        else line[x] = "plains";
      }
      out[y] = line;
    }
    return out;
  }

  function deepFindAnyGrid(obj, depth=0){
    if (!obj || depth > 3) return null;
    for (const key of ["grid","tiles","map","world"]){
      if (looks2DArray(obj?.[key])) return { key, grid: normalize2DArrayToStrings(obj[key]) };
    }
    if (typeof obj === "object"){
      for (const [k,v] of Object.entries(obj)){
        if (looks2DArray(v)) return { key:k, grid: normalize2DArrayToStrings(v) };
      }
      for (const [k,v] of Object.entries(obj)){
        if (v && typeof v === "object"){
          const found = deepFindAnyGrid(v, depth+1);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function getGrid(shard) {
    const found = deepFindAnyGrid(shard);
    if (found?.grid) return found.grid;
    warn("[v2] no grid found", { keys: Object.keys(shard||{}) });
    return null;
  }

  const dims = (grid) => {
    const H = grid?.length || 0;
    const W = H ? grid[0].length : 0;
    return [W, H];
  };

  function desiredScaleToFit(W,H) {
    if (!els.panel) return 8;
    const b = els.panel.getBoundingClientRect();
    const pad = 24;
    const maxW = Math.max(32, b.width  - pad);
    const maxH = Math.max(32, b.height - pad);
    const sx = Math.floor(maxW / Math.max(1, W));
    const sy = Math.floor(maxH / Math.max(1, H));
    return Math.max(1, Math.min(sx, sy));
  }

  const getScale = () => Math.max(1, parseInt(els.scale?.value || "8", 10));
  const getAlpha = () => {
    const v = parseInt(els.opacity?.value || "85", 10);
    return Math.max(0, Math.min(100, isNaN(v) ? 85 : v)) / 100;
  };
  const colors = () => Palettes[els.palette?.value || "classic"] || Palettes.classic;

  // ---- DPR-aware sizing & spaces -------------------------------------------
  function prepOverlayCtx() {
    // Overlay draws in CSS px; DPR handled by bitmap size
    const r = dpr();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function ensureCanvasSizes(W,H){
    const s = getScale();
    if (!W || !H) return;
    // Base canvas uses CSS px bitmap (no DPR scaling). Style size == bitmap size.
    if (els.base.width !== W*s || els.base.height !== H*s) {
      els.base.width  = W*s;
      els.base.height = H*s;
      els.base.style.width  = `${W*s}px`;
      els.base.style.height = `${H*s}px`;
    }
    // Overlay bitmap scaled by DPR; CSS size matches base exactly.
    overlay.width  = Math.max(2, Math.floor(W*s*dpr()));
    overlay.height = Math.max(2, Math.floor(H*s*dpr()));
    overlay.style.width  = `${W*s}px`;
    overlay.style.height = `${H*s}px`;
    prepOverlayCtx();
  }

  function clearOverlay(){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.restore();
    prepOverlayCtx();
  }

  const tileRect   = (x,y,s)=>[x*s,y*s,s,s];           // CSS px
  const tileCenter = (x,y,s)=>[(x+.5)*s,(y+.5)*s];     // CSS px

  function biomeColor(id) {
    switch (String(id).toLowerCase()) {
      case "ocean": return "#0b3a74";
      case "coast":
      case "beach": return "#d9c38c";
      case "marsh-lite":
      case "marsh": return "#8fae84";
      case "plains": return "#91c36e";
      case "forest": return "#2e7d32";
      case "tundra": return "#b2c2c2";
      case "desert": return "#e0c067";
      default: {
        // stable hash color
        let h=0; const s=42, l=62;
        const t=String(id); for (let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0;
        return `hsl(${h%360} ${s}% ${l}%)`;
      }
    }
  }

  // ---------- drawing ----------
  function drawBiomes(grid) {
    if (!Array.isArray(grid) || !grid.length) return;
    const s = getScale();
    const bctx = els.base.getContext("2d");
    bctx.clearRect(0,0,els.base.width,els.base.height);
    for (let y=0;y<grid.length;y++){
      const row = grid[y];
      for (let x=0;x<row.length;x++){
        bctx.fillStyle = biomeColor(row[x]);
        bctx.fillRect(x*s, y*s, s, s);
      }
    }
  }

  function drawGridLines(grid){
    if (!els.grid?.checked || !Array.isArray(grid) || !grid.length) return;
    const s = getScale();
    const [W,H] = dims(grid);
    const line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim() || "#233042";
    ctx.save();
    ctx.globalAlpha = Math.min(1, getAlpha() + 0.2);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1; // 1 CSS px
    ctx.beginPath();
    for (let x=0; x<=W; x++){ const px = x*s; ctx.moveTo(px, 0); ctx.lineTo(px, H*s); }
    for (let y=0; y<=H; y++){ const py = y*s; ctx.moveTo(0, py); ctx.lineTo(W*s, py); }
    ctx.stroke();
    ctx.restore();
  }

  function drawRivers(shard) {
    const r = shard?.layers?.hydrology?.rivers;
    if (!Array.isArray(r) || !r.length) return;
    const s = getScale(), c = colors();
    ctx.save();
    ctx.globalAlpha = getAlpha();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = c.river; ctx.lineWidth = Math.max(1, Math.round(s*0.22));
    for (const path of r) {
      if (!Array.isArray(path) || path.length < 2) continue;
      ctx.beginPath();
      let [x0,y0] = tileCenter(path[0][0]|0, path[0][1]|0, s);
      ctx.moveTo(x0,y0);
      for (let i=1;i<path.length;i++){
        const [cx,cy] = tileCenter(path[i][0]|0, path[i][1]|0, s);
        ctx.lineTo(cx,cy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLakes(shard) {
    const lakes = shard?.layers?.hydrology?.lakes;
    if (!Array.isArray(lakes) || !lakes.length) return;
    const s = getScale(), c = colors();
    ctx.save();
    ctx.globalAlpha = getAlpha() * 0.85;
    ctx.fillStyle = c.lake;
    for (const lk of lakes) {
      const tiles = Array.isArray(lk) ? lk : (lk?.tiles || []);
      for (const t of tiles) {
        const x=t[0]|0, y=t[1]|0;
        const [px,py,w,h] = tileRect(x,y,s);
        ctx.fillRect(px,py,w,h);
      }
    }
    ctx.restore();
  }

  function drawHoverHighlight() {
    const { grid, hover } = SV2.state;
    if (!grid || hover.x < 0 || hover.y < 0) return;
    const s = getScale();
    const [px,py,w,h] = tileRect(hover.x, hover.y, s);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px+1, py+1, w-2, h-2);
    ctx.restore();
  }

  function renderOverlays() {
    clearOverlay();
    if (SV2.state.hidden) return;
    drawGridLines(SV2.state.grid);
    if (els.rivers?.checked) drawRivers(SV2.state.shard);
    if (els.lakes?.checked)  drawLakes(SV2.state.shard);
    drawHoverHighlight();
  }

  function renderAll(shard) {
    if (!shard) return;
    const grid = getGrid(shard);
    SV2.state.shard = shard;
    SV2.state.grid  = grid;

    const [W,H] = dims(grid);
    ensureCanvasSizes(W,H);
    if (W && H && els.autoFit?.checked) {
      const s = desiredScaleToFit(W,H);
      if (getScale() !== s) { els.scale.value = String(s); ensureCanvasSizes(W,H); }
    }

    // draw base biomes
    if (els.biomes?.checked) drawBiomes(grid);
    else els.base.getContext("2d").clearRect(0,0,els.base.width,els.base.height);

    // overlays (grid/rivers/lakes + hover)
    renderOverlays();
    enableLayerToggles(shard);
  }

  function enableLayerToggles(shard){
    const hasRivers = Array.isArray(shard?.layers?.hydrology?.rivers) && shard.layers.hydrology.rivers.length>0;
    const hasLakes  = Array.isArray(shard?.layers?.hydrology?.lakes)  && shard.layers.hydrology.lakes.length>0;
    setToggle(els.rivers, hasRivers, "No rivers in this shard");
    setToggle(els.lakes,  hasLakes,  "No lakes in this shard");
  }
  function setToggle(input, enabled, title){
    if (!input) return;
    input.disabled = !enabled;
    if (!enabled) { input.checked = false; input.title = title || ""; }
    else input.title = "";
  }

  // ---------- loading ----------
  async function fetchShardList() {
    try {
      const res = await fetch("/api/shards");
      const data = await res.json().catch(() => ({}));
      let list = Array.isArray(data) ? data : (Array.isArray(data.shards) ? data.shards : []);
      return list.map(item => {
        if (typeof item === "string") {
          const name = item.replace(/^.*\//,"");
          return {
            name,
            api: `/api/shards/${name.replace(/\.json$/,'')}`,
            path: item.startsWith("/") ? item : `/static/public/shards/${item}`,
            label: name.replace(/\.json$/,"")
          };
        }
        const name = item.name || item.file || (item.meta?.name) || "unknown.json";
        return {
          name,
          api: `/api/shards/${String(name).replace(/\.json$/,'')}`,
          path: item.path || `/static/public/shards/${name}`,
          label: item.meta?.displayName || (name.replace(/\.json$/,""))
        };
      });
    } catch (e) {
      derr("[v2] /api/shards error", e);
      return [];
    }
  }

  async function populateList() {
    setStatus("Loading shard list…");
    const items = await fetchShardList();
    els.select.innerHTML = "";
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.name;
      opt.textContent = it.label;
      opt.setAttribute("data-path", it.path);
      opt.setAttribute("data-api", it.api);
      els.select.appendChild(opt);
    }
    setStatus(items.length ? `Loaded ${items.length} shard(s)` : "No shards found");
    return items.length;
  }

  async function loadSelectedShard() {
    const opt = els.select?.selectedOptions?.[0];
    if (!opt) { warn("[v2] no option selected"); return; }
    const api = opt.getAttribute("data-api");
    const filePath = opt.getAttribute("data-path") || `/static/public/shards/${opt.value}`;

    let shard = null, used = "";
    try {
      const r1 = await fetch(api);
      if (r1.ok) { shard = await r1.json(); used = api; }
      else {
        const r2 = await fetch(filePath);
        if (r2.ok) { shard = await r2.json(); used = filePath; }
      }
    } catch (e) { derr("[v2] loadSelectedShard fetch error", e); }

    if (!shard) { setStatus("Failed to fetch shard"); return; }
    setStatus(`Loaded ${shard?.meta?.displayName || opt.textContent}`);
    renderAll(shard);
  }

  // ---------- events ----------
  els.loadBtn?.addEventListener("click", (e) => { e.preventDefault(); loadSelectedShard(); });
  els.select?.addEventListener("change", () => loadSelectedShard());

  // viewer controls
  els.scale?.addEventListener("input", () => renderAll(SV2.state.shard));
  els.grid?.addEventListener("change", () => renderAll(SV2.state.shard));
  els.autoFit?.addEventListener("change", () => renderAll(SV2.state.shard));
  els.opacity?.addEventListener("input", () => renderAll(SV2.state.shard));
  els.palette?.addEventListener("change", () => renderAll(SV2.state.shard));

  // layer toggles
  [els.biomes, els.rivers, els.lakes, els.roads, els.bridges, els.poi, els.settlements, els.ports, els.resources]
    .filter(Boolean)
    .forEach(cb => cb.addEventListener("change", () => renderOverlays()));

  // zoom buttons
  function zoomDelta(d){
    const cur = getScale();
    const next = Math.max(1, cur + d);
    els.scale.value = String(next);
    renderAll(SV2.state.shard);
  }
  els.btnZoomIn?.addEventListener("click", () => zoomDelta(+1));
  els.btnZoomOut?.addEventListener("click", () => zoomDelta(-1));
  els.btnFit?.addEventListener("click", () => {
    const g = SV2.state.grid; if (!g) return;
    const [W,H] = dims(g);
    els.scale.value = String(desiredScaleToFit(W,H));
    renderAll(SV2.state.shard);
  });

  // keyboard zoom & overlay hide
  window.addEventListener("keydown", (e) => {
    if (e.altKey && !SV2.state.hidden) { SV2.state.hidden = true; clearOverlay(); return; }
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomDelta(+1); }
    if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomDelta(-1); }
    if (e.key.toLowerCase() === "f" || e.key === "0") {
      e.preventDefault();
      const g = SV2.state.grid; if (!g) return;
      const [W,H] = dims(g);
      els.scale.value = String(desiredScaleToFit(W,H));
      renderAll(SV2.state.shard);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (!e.altKey && SV2.state.hidden) { SV2.state.hidden = false; renderOverlays(); }
  });

  // hover tooltip + highlight (overlay-only redraw)
  function updateHover(e){
    const g = SV2.state.grid; if (!g) return;
    const s = getScale();
    const rect = els.base.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / s);
    const y = Math.floor((e.clientY - rect.top)  / s);
    const [W,H] = dims(g);
    if (x<0||y<0||x>=W||y>=H){
      SV2.state.hover.x = SV2.state.hover.y = -1;
      if (els.tip) els.tip.style.display = "none";
      renderOverlays(); // clear previous highlight
      return;
    }
    // update hover state
    if (SV2.state.hover.x !== x || SV2.state.hover.y !== y){
      SV2.state.hover.x = x; SV2.state.hover.y = y;
      renderOverlays();
    }
    // tooltip
    if (els.tip){
      const biome = g[y][x];
      els.tip.style.display = "block";
      els.tip.style.left = (e.clientX - rect.left + 12) + "px";
      els.tip.style.top  = (e.clientY - rect.top  + 12) + "px";
      els.tip.innerHTML = `(${x}, ${y}) — ${biome}`;
    }
  }
  els.frame.addEventListener("mousemove", updateHover);
  els.frame.addEventListener("mouseleave", () => {
    SV2.state.hover.x = SV2.state.hover.y = -1;
    if (els.tip) els.tip.style.display = "none";
    renderOverlays();
  });

  // ---------- boot ----------
  (async () => {
    setStatus("Booting viewer v2…");
    if (els.biomes) els.biomes.checked = true;
    const n = await populateList();
    if (n > 0) loadSelectedShard();
    else setStatus("No shards found. Generate one via /api/shard-gen-v2/generate.");
  })();

  setStatus("v2 overlay ready");
})();
