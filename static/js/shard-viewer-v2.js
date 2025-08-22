// /static/js/shard-viewer-v2.js
(() => {
  // ================ tiny helpers ================
  const $id = (id) => document.getElementById(id);
  const SV2 = (window.SV2 = window.SV2 || {});
  const DEBUG = new URLSearchParams(location.search).has("debug") || localStorage.SV2_DEBUG === "1";
  const log = (...a) => DEBUG && console.log("[SV2]", ...a);
  const warn = (...a) => DEBUG && console.warn("[SV2]", ...a);
  const err = (...a) => console.error("[SV2]", ...a);
  const setStatus = (m) => { const s = $id("status"); if (s) s.textContent = m; };

  const isTypingInField = (t) => {
    if (!t) return false;
    const tag = (t.tagName || "").toUpperCase();
    const type = (t.type || "").toLowerCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") return !["checkbox","radio","button","range","submit","reset","file","color"].includes(type);
    return t.isContentEditable === true;
  };

  const clampInt = (v, min, max) => Math.max(min, Math.min(max, (parseInt(v, 10) || 0)));

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    try { return await r.json(); } catch { return null; }
  }
  async function postJSON(url, body) {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  }

  // ================ attach to DOM (resilient) ================
  const els = {
    frame: $id("frame") || document.querySelector(".canvas-wrap") || document.querySelector(".viewer") || document.body,
    base:  $id("canvas"),
    select: $id("shardSelect"),
    loadBtn: $id("btnLoad"),
    // layer toggles
    biomes: $id("layerBiomes"),
    rivers: $id("layerRivers"),
    lakes: $id("layerLakes"),
    roads: $id("layerRoads"),
    bridges: $id("layerBridges"),
    settlements: $id("layerSettlements"),
    ports: $id("layerPorts"),
    resources: $id("layerResources"),
    // view controls
    scale: $id("scale"),
    grid: $id("grid"),
    autoFit: $id("autoFit"),
    opacity: $id("overlayOpacity"),
    palette: $id("palette"),
    btnFit: $id("btnFit"),
    btnZoomIn: $id("btnZoomIn"),
    btnZoomOut: $id("btnZoomOut"),
    // plan/generate
    planBtn: $id("btnPlanV2") || $id("btnPlan"),
    genBtn:  $id("btnGenerateV2") || $id("btnGenerateFromPlan"),
    status: $id("status"),
    tip: $id("tooltip"),
  };

  if (!els.base) {
    // if canvas missing, create one
    els.base = document.createElement("canvas");
    els.base.id = "canvas";
    els.frame?.appendChild(els.base);
  }
  if (!els.tip) {
    const t = document.createElement("div");
    t.id = "tooltip";
    els.frame.appendChild(t);
    els.tip = t;
  }
  Object.assign(els.tip.style, {
    position: "absolute", left: "0", top: "0", display: "none",
    background: "rgba(0,0,0,.85)", color: "#fff", padding: "4px 6px",
    borderRadius: "6px", fontSize: "12px", pointerEvents: "none", zIndex: "50",
  });

  // If shard picker is missing, synthesize one at top of viewer
  function ensureShardSelect() {
    if (els.select) return els.select;
    const host = $id("shardBar") || document.querySelector(".viewer") || document.body;
    const sel = document.createElement("select");
    sel.id = "shardSelect";
    sel.style.marginRight = "8px";
    const btn = document.createElement("button");
    btn.id = "btnLoad";
    btn.textContent = "Load";
    host.prepend(btn);
    host.prepend(sel);
    els.select = sel;
    els.loadBtn = btn;
    els.select.addEventListener("change", () => loadSelectedShard());
    els.loadBtn.addEventListener("click", (e) => { e.preventDefault(); loadSelectedShard(); });
    return sel;
  }
  ensureShardSelect();

  // ================ viewer state ================
  SV2.state = SV2.state || {
    shard: null,
    grid: null,
    hover: { x: -1, y: -1 },
    hidden: false,
    lastPlanBody: null,
    lastPlanResp: null,
    lastGenResp: null,
    idx: {
      rivers: new Set(), lakes: new Set(), roads: new Set(), bridges: new Set(),
      ports: new Set(), cities: new Set(), towns: new Set(), villages: new Set(),
    }
  };

  // ================ palettes ================
  const Palettes = {
    classic:  { river:"#2d7bd2", lake:"#4aa3ff", road:"#d9dadf", bridge:"#ffd166", port:"#ffd166", city:"#fff", town:"#fed", village:"#ffc" },
    contrast: { river:"#0055ff", lake:"#00c3ff", road:"#e1e1e1", bridge:"#ffcc33", port:"#ffcc33", city:"#fff", town:"#fed", village:"#ffc" },
    pastel:   { river:"#5da7f5", lake:"#8cc9ff", road:"#e3e6ee", bridge:"#ffd67a", port:"#ffd67a", city:"#fff", town:"#fed", village:"#ffc" },
    noir:     { river:"#6aa9ff", lake:"#9ec8ff", road:"#c9ccd3", bridge:"#f3c54d", port:"#f3c54d", city:"#eee", town:"#ddd", village:"#ccc" },
  };
  const colors = () => Palettes[els.palette?.value || "classic"] || Palettes.classic;
  const dpr = () => window.devicePixelRatio || 1;

  // ================ grid helpers ================
  const looks2DArray = a => Array.isArray(a) && a.length && Array.isArray(a[0]);
  function normalize2DArrayToStrings(twoD) {
    const out = new Array(twoD.length);
    for (let y=0; y<twoD.length; y++) {
      const row = twoD[y], line = new Array(row.length);
      for (let x=0; x<row.length; x++) {
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
  function deepFindAnyGrid(obj, depth=0) {
    if (!obj || depth > 3) return null;
    for (const key of ["grid","tiles","map","world"]) {
      if (looks2DArray(obj?.[key])) return { key, grid: normalize2DArrayToStrings(obj[key]) };
    }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        if (looks2DArray(v)) return { key: k, grid: normalize2DArrayToStrings(v) };
      }
      for (const [, v] of Object.entries(obj)) {
        if (v && typeof v === "object") {
          const f = deepFindAnyGrid(v, depth+1);
          if (f) return f;
        }
      }
    }
    return null;
  }
  const dims = (grid) => {
    const H = grid?.length || 0;
    const W = H ? grid[0].length : 0;
    return [W, H];
  };

  // ================ canvas / overlay ================
  const overlay = document.createElement("canvas");
  overlay.id = "overlayCanvasV2";
  overlay.style.pointerEvents = "none";
  els.frame.appendChild(overlay);
  const octx = overlay.getContext("2d", { willReadFrequently: true });

  function prepOverlayCtx() { const r = dpr(); octx.setTransform(r,0,0,r,0,0); octx.imageSmoothingEnabled = false; }
  function getScale() { return Math.max(1, parseInt(els.scale?.value || "8", 10)); }
  const getAlpha = () => Math.max(0, Math.min(1, (parseInt(els.opacity?.value || "85", 10) || 85) / 100));
  function ensureCanvasSizes(W, H) {
    const s = getScale();
    if (!W || !H) return;
    if (els.base.width !== W*s || els.base.height !== H*s) {
      els.base.width = W*s; els.base.height = H*s;
      els.base.style.width = `${W*s}px`; els.base.style.height = `${H*s}px`;
    }
    overlay.width  = Math.max(2, Math.floor(W*s*dpr()));
    overlay.height = Math.max(2, Math.floor(H*s*dpr()));
    overlay.style.width = `${W*s}px`; overlay.style.height = `${H*s}px`;
    prepOverlayCtx();
  }
  function clearOverlay(){ octx.save(); octx.setTransform(1,0,0,1,0,0); octx.clearRect(0,0,overlay.width,overlay.height); octx.restore(); prepOverlayCtx(); }
  const tileRect   = (x,y,s)=>[x*s,y*s,s,s];
  const tileCenter = (x,y,s)=>[(x+.5)*s,(y+.5)*s];

  function biomeColor(id) {
    switch(String(id).toLowerCase()){
      case "ocean": return "#0b3a74";
      case "coast": case "beach": return "#d9c38c";
      case "marsh-lite": case "marsh": return "#8fae84";
      case "plains": return "#91c36e";
      case "forest": return "#2e7d32";
      case "tundra": return "#b2c2c2";
      case "desert": return "#e0c067";
      case "hills": return "#97b06b";
      case "mountains": return "#8e3c3c";
      default: { let h=0; const s=42,l=62; const t=String(id); for(let i=0;i<t.length;i++) h=(h*31+t.charCodeAt(i))>>>0; return `hsl(${h%360} ${s}% ${l}%)`; }
    }
  }
  function drawBiomes(grid){
    const s = getScale(), bctx = els.base.getContext("2d");
    bctx.clearRect(0,0,els.base.width,els.base.height);
    for(let y=0;y<grid.length;y++){ const row=grid[y];
      for(let x=0;x<row.length;x++){ bctx.fillStyle=biomeColor(row[x]); bctx.fillRect(x*s,y*s,s,s); }
    }
  }
  function drawGridLines(grid){
    if (!els.grid?.checked || !Array.isArray(grid) || !grid.length) return;
    const s=getScale(); const [W,H]=dims(grid); const line=getComputedStyle(document.documentElement).getPropertyValue("--line").trim()||"#233042";
    octx.save(); octx.globalAlpha=Math.min(1, getAlpha()+.2); octx.strokeStyle=line; octx.lineWidth=1; octx.beginPath();
    for(let x=0;x<=W;x++){ const px=x*s; octx.moveTo(px,0); octx.lineTo(px,H*s); }
    for(let y=0;y<=H;y++){ const py=y*s; octx.moveTo(0,py); octx.lineTo(W*s,py); }
    octx.stroke(); octx.restore();
  }
  function drawPathLines(paths, col, lw){
    const s=getScale(); octx.save(); octx.globalAlpha=getAlpha(); octx.lineCap="round"; octx.lineJoin="round"; octx.strokeStyle=col; octx.lineWidth=Math.max(1, Math.round(s*lw));
    for(const path of (paths||[])){ if(!Array.isArray(path)||path.length<2) continue; octx.beginPath(); let [x0,y0]=tileCenter(path[0][0]|0, path[0][1]|0, s); octx.moveTo(x0,y0);
      for(let i=1;i<path.length;i++){ const [cx,cy]=tileCenter(path[i][0]|0, path[i][1]|0, s); octx.lineTo(cx,cy); } octx.stroke(); }
    octx.restore();
  }
  const drawRivers = shard => drawPathLines(shard?.layers?.hydrology?.rivers, colors().river, .22);
  function drawLakes(shard){
    const lakes = shard?.layers?.hydrology?.lakes; if(!Array.isArray(lakes)||!lakes.length) return;
    const s=getScale(); octx.save(); octx.globalAlpha=getAlpha()*.85; octx.fillStyle=colors().lake;
    for(const lk of lakes){ const tiles=Array.isArray(lk)?lk:(lk?.tiles||[]); for(const t of tiles){ const x=t[0]|0,y=t[1]|0; const [px,py,w,h]=tileRect(x,y,s); octx.fillRect(px,py,w,h); } }
    octx.restore();
  }
  function drawRoads(shard){
    if(!els.roads?.checked) return; const roads=shard?.layers?.roads?.paths; if(!Array.isArray(roads)||!roads.length) return;
    const s=getScale(); octx.save(); octx.globalAlpha=Math.max(.75,getAlpha()); octx.strokeStyle=colors().road; octx.lineWidth=Math.max(1,Math.round(s*.18)); octx.lineCap="round"; octx.lineJoin="round";
    for(const path of roads){ if(!Array.isArray(path)||path.length<2) continue; octx.beginPath(); let [x0,y0]=tileCenter(path[0][0]|0, path[0][1]|0, s); octx.moveTo(x0,y0);
      for(let i=1;i<path.length;i++){ const [cx,cy]=tileCenter(path[i][0]|0, path[i][1]|0, s); octx.lineTo(cx,cy); } octx.stroke(); } octx.restore();
  }
  function drawBridges(shard){
    if(!els.bridges?.checked) return; const bridges=shard?.layers?.roads?.bridges; if(!Array.isArray(bridges)||!bridges.length) return;
    const s=getScale(); octx.save(); octx.globalAlpha=Math.max(.8,getAlpha()); octx.fillStyle=colors().bridge; octx.strokeStyle="#222"; octx.lineWidth=1;
    for(const b of bridges){ const x=(b.x??b[0])|0, y=(b.y??b[1])|0; const [px,py,w,h]=tileRect(x,y,s); const pad=Math.max(1,Math.round(s*.20)); octx.fillRect(px+pad,py+pad,w-2*pad,h-2*pad); octx.strokeRect(px+pad,py+pad,w-2*pad,h-2*pad); }
    octx.restore();
  }
  function drawPorts(shard){
    if(!els.ports?.checked) return;
    const ports = shard?.layers?.settlements?.ports || (Array.isArray(shard?.sites)?shard.sites.filter(s=>s?.type==="port").map(s=>({x:s.x,y:s.y})):[]);
    if(!Array.isArray(ports)||!ports.length) return;
    const s=getScale(); octx.save(); octx.globalAlpha=1; for(const p of ports){ const x=(p.x??p[0])|0, y=(p.y??p[1])|0; const [cx,cy]=tileCenter(x,y,s); const r=Math.max(2,Math.round(s*.22));
      octx.fillStyle=colors().port; octx.strokeStyle="#1b263b"; octx.lineWidth=1; octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fill(); octx.stroke(); } octx.restore();
  }
  function drawSettlements(shard){
    if(!els.settlements?.checked) return; const s=getScale();
    const drawSet=(arr, fill)=>{ if(!Array.isArray(arr)||!arr.length) return; octx.save(); octx.globalAlpha=1; octx.fillStyle=fill; octx.strokeStyle="#1b263b"; octx.lineWidth=1;
      for(const p of arr){ const x=(p.x??p[0])|0,y=(p.y??p[1])|0; const [cx,cy]=tileCenter(x,y,s); const r=Math.max(2,Math.round(s*.18)); octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fill(); octx.stroke(); }
      octx.restore(); };
    const set=shard?.layers?.settlements||{}, c=colors(); drawSet(set.cities,c.city); drawSet(set.towns,c.town); drawSet(set.villages,c.village);
  }
  function drawHoverHighlight(){
    const g = SV2.state.grid; const {x,y}=SV2.state.hover; if(!g||x<0||y<0) return; const s=getScale(); const [px,py,w,h]=tileRect(x,y,s);
    octx.save(); octx.globalAlpha=.85; octx.strokeStyle="rgba(255,255,255,.85)"; octx.lineWidth=2; octx.strokeRect(px+1,py+1,w-2,h-2); octx.restore();
  }
  function renderOverlays(){
    clearOverlay(); if(SV2.state.hidden) return;
    drawGridLines(SV2.state.grid);
    if(els.rivers?.checked) drawRivers(SV2.state.shard);
    if(els.lakes?.checked) drawLakes(SV2.state.shard);
    if(els.roads?.checked) drawRoads(SV2.state.shard);
    if(els.bridges?.checked) drawBridges(SV2.state.shard);
    if(els.ports?.checked) drawPorts(SV2.state.shard);
    if(els.settlements?.checked) drawSettlements(SV2.state.shard);
    drawHoverHighlight();
  }
  function desiredScaleToFit(W,H){
    const panel = document.querySelector(".viewer .canvas-wrap") || els.frame;
    const b = panel.getBoundingClientRect(); const pad=24;
    const maxW=Math.max(32,b.width-pad), maxH=Math.max(32,b.height-pad);
    const sx=Math.floor(maxW/Math.max(1,W)), sy=Math.floor(maxH/Math.max(1,H)); return Math.max(1, Math.min(sx,sy));
  }

  // ================ indexes & render ================
  function rebuildIndexes(shard){
    const idx=SV2.state.idx; for(const k of Object.keys(idx)) idx[k].clear();
    const mark=(set,x,y)=>set.add(`${x},${y}`);
    const s=shard?.layers||{};
    for(const path of (s?.hydrology?.rivers||[])) for(const [x,y] of path) mark(idx.rivers,x|0,y|0);
    for(const lk of (s?.hydrology?.lakes||[])){ const tiles=Array.isArray(lk)?lk:(lk?.tiles||[]); for(const [x,y] of tiles) mark(idx.lakes,x|0,y|0); }
    for(const path of (s?.roads?.paths||[])) for(const [x,y] of path) mark(idx.roads,x|0,y|0);
    for(const b of (s?.roads?.bridges||[])){ const x=(b.x??b[0])|0, y=(b.y??b[1])|0; mark(idx.bridges,x,y); }
    const sets=s?.settlements||{}; for(const p of (sets.cities||[])) mark(idx.cities,(p.x??p[0])|0,(p.y??p[1])|0);
    for(const p of (sets.towns||[])) mark(idx.towns,(p.x??p[0])|0,(p.y??p[1])|0);
    for(const p of (sets.villages||[])) mark(idx.villages,(p.x??p[0])|0,(p.y??p[1])|0);
    for(const p of (sets.ports||[])) mark(idx.ports,(p.x??p[0])|0,(p.y??p[1])|0);
  }
  function renderAll(shard){
    if(!shard){ warn("renderAll: no shard"); return; }
    const found=deepFindAnyGrid(shard), grid=found?.grid||null;
    SV2.state.shard=shard; SV2.state.grid=grid;
    const [W,H]=dims(grid); ensureCanvasSizes(W,H);
    if(W&&H&&els.autoFit?.checked){ const s=desiredScaleToFit(W,H); if(getScale()!==s){ els.scale.value=String(s); ensureCanvasSizes(W,H);} }
    if(els.biomes?.checked) drawBiomes(grid); else els.base.getContext("2d").clearRect(0,0,els.base.width,els.base.height);
    rebuildIndexes(shard); renderOverlays();
  }

  // ================ hover tooltip ================
  function getElevationAt(shard,x,y){ const lay=shard?.layers?.elevation; if(Array.isArray(lay)&&Array.isArray(lay[y])){ const v=lay[y][x]; return (v??v===0)?v:null; } return null; }
  function updateHoverFromPoint(clientX, clientY){
    const g=SV2.state.grid; if(!g) return;
    const s=getScale(); const rect=els.base.getBoundingClientRect();
    const x=Math.floor((clientX-rect.left)/s), y=Math.floor((clientY-rect.top)/s);
    const [W,H]=dims(g);
    if(x<0||y<0||x>=W||y>=H){ SV2.state.hover.x=SV2.state.hover.y=-1; els.tip.style.display="none"; renderOverlays(); return; }
    if(SV2.state.hover.x!==x||SV2.state.hover.y!==y){ SV2.state.hover.x=x; SV2.state.hover.y=y; renderOverlays(); }
    const idx=SV2.state.idx, key=`${x},${y}`, tags=[];
    if(idx.rivers.has(key))tags.push("river"); if(idx.lakes.has(key))tags.push("lake"); if(idx.roads.has(key))tags.push("road");
    if(idx.bridges.has(key))tags.push("bridge"); if(idx.ports.has(key))tags.push("port");
    if(idx.cities.has(key))tags.push("city"); if(idx.towns.has(key))tags.push("town"); if(idx.villages.has(key))tags.push("village");
    const biome=g[y][x], elev=getElevationAt(SV2.state.shard,x,y);
    els.tip.style.display="block"; els.tip.style.left=(clientX-rect.left+12)+"px"; els.tip.style.top=(clientY-rect.top+12)+"px";
    els.tip.innerHTML=`(${x}, ${y}) — ${biome} • elev: ${elev ?? "—"}${tags.length? " • "+tags.join(", "):""}`;
  }
  els.frame.addEventListener("pointermove",(e)=>updateHoverFromPoint(e.clientX,e.clientY));
  els.frame.addEventListener("pointerdown",(e)=>updateHoverFromPoint(e.clientX,e.clientY));
  els.frame.addEventListener("pointerleave",()=>{ SV2.state.hover.x=SV2.state.hover.y=-1; els.tip.style.display="none"; renderOverlays(); });
  els.frame.addEventListener("touchstart",(e)=>{ const t=e.touches?.[0]; if(t) updateHoverFromPoint(t.clientX,t.clientY); }, {passive:true});
  els.frame.addEventListener("touchmove",(e)=>{ const t=e.touches?.[0]; if(t) updateHoverFromPoint(t.clientX,t.clientY); }, {passive:true});
  els.frame.addEventListener("touchend",()=>{ SV2.state.hover.x=SV2.state.hover.y=-1; els.tip.style.display="none"; renderOverlays(); });

  // ================ fetching shards list + load ================
  async function fetchShardList(){
    try {
      const data = await getJSON("/api/shards");
      // support both [{file,path,meta}] and ["foo.json"]
      const list = Array.isArray(data) ? data : (Array.isArray(data?.shards) ? data.shards : []);
      return list.map((it) => {
        if (typeof it === "string") {
          const name = it.replace(/^.*\//,"");
          return { name, label: name.replace(/\.json$/,""), path: it.startsWith("/") ? it : `/static/public/shards/${it}` };
        }
        const file = it.file || it.name || it.path || "unknown.json";
        return { name: file, label: (it.meta?.displayName) || file.replace(/\.json$/,""), path: it.path || `/static/public/shards/${file}` };
      });
    } catch (e) { err("fetchShardList:", e); return []; }
  }
  async function populateList() {
    setStatus("Loading shard list…");
    const items = await fetchShardList();
    ensureShardSelect();
    els.select.innerHTML = "";
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.name;
      opt.textContent = it.label;
      opt.setAttribute("data-path", it.path);
      els.select.appendChild(opt);
    }
    setStatus(items.length ? `Loaded ${items.length} shard(s)` : "No shards found");
    return items.length;
  }
  async function loadSelectedShard() {
    const opt = els.select?.selectedOptions?.[0];
    if (!opt) { warn("loadSelectedShard: no selection"); return; }
    const path = opt.getAttribute("data-path") || `/static/public/shards/${opt.value}`;
    try {
      const shard = await getJSON(path);
      if (!shard) throw new Error("invalid JSON");
      setStatus(`Loaded: ${shard?.meta?.displayName || opt.textContent}`);
      renderAll(shard);
    } catch (e) {
      setStatus(`Failed to load shard: ${e.message}`);
    }
  }

  // ================ keyboard zoom (doesn't block typing '-') ================
  function zoomDelta(d){ const cur=getScale(); const next=Math.max(1,cur+d); if (els.scale) els.scale.value=String(next); renderAll(SV2.state.shard); }
  window.addEventListener("keydown",(e)=>{
    if (isTypingInField(e.target)) return; // let inputs receive '-', '+', etc
    if (e.altKey && !SV2.state.hidden){ SV2.state.hidden=true; clearOverlay(); return; }
    if (e.key==="+"||e.key==="="){ e.preventDefault(); zoomDelta(+1); }
    if (e.key==="-"||e.key==="_"){ e.preventDefault(); zoomDelta(-1); }
    if (e.key.toLowerCase()==="f"||e.key==="0"){ e.preventDefault(); const g=SV2.state.grid; if(!g) return; const [W,H]=dims(g); if (els.scale) { els.scale.value=String(desiredScaleToFit(W,H)); } renderAll(SV2.state.shard); }
  });
  window.addEventListener("keyup",(e)=>{ if(!e.altKey && SV2.state.hidden){ SV2.state.hidden=false; renderOverlays(); } });

  // View toggles
  els.loadBtn?.addEventListener("click",(e)=>{ e.preventDefault(); loadSelectedShard(); });
  els.select?.addEventListener("change",()=> loadSelectedShard());
  els.scale?.addEventListener("input",()=> renderAll(SV2.state.shard));
  els.grid?.addEventListener("change",()=> renderAll(SV2.state.shard));
  els.autoFit?.addEventListener("change",()=> renderAll(SV2.state.shard));
  els.opacity?.addEventListener("input",()=> renderAll(SV2.state.shard));
  els.palette?.addEventListener("change",()=> renderAll(SV2.state.shard));
  [els.biomes,els.rivers,els.lakes,els.roads,els.bridges,els.settlements,els.ports,els.resources]
    .filter(Boolean).forEach(cb=>cb.addEventListener("change",()=> renderOverlays()));
  els.btnZoomIn?.addEventListener("click",()=> zoomDelta(+1));
  els.btnZoomOut?.addEventListener("click",()=> zoomDelta(-1));
  els.btnFit?.addEventListener("click",()=>{ const g=SV2.state.grid; if(!g) return; const [W,H]=dims(g); if (els.scale) els.scale.value=String(desiredScaleToFit(W,H)); renderAll(SV2.state.shard); });

  // ================ PLAN OVERLAY (tiers, locked grid) ================
  function parseCoastWidth(val){
    const t = String(val ?? "").trim();
    if (!t) return [1, 2];
    const m = t.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1],10), b = parseInt(m[2],10);
      if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a,b), Math.max(a,b)];
    }
    const n = parseInt(t,10);
    return Number.isFinite(n) ? [n,n] : [1,2];
  }
  async function fetchTiers(){ try{ return await getJSON("/api/shard-gen-v2/tiers"); }catch{ return []; } }

  function buildPlanBody(vals){
    const seed = vals.autoSeed ? undefined : (vals.seed ? Number(vals.seed) : undefined);
    const overrides = {
      // grid: intentionally OMITTED — template grid is authoritative
      water: { coast_width: parseCoastWidth(vals.coastWidth) },
      world: { type: vals.worldType, landmass_ratio: Math.max(5, Math.min(90, +vals.landPct)) / 100 },
      noise: { octaves: clampInt(vals.octaves,1,8), frequency: Number(vals.freq||1.3), lacunarity: Number(vals.lacunarity||2.0), gain: Number(vals.gain||0.5), smooth_iters: clampInt(vals.smooth,0,4) },
      hydrology: { desired_rivers: clampInt(vals.rivers,0,256), desired_lakes: clampInt(vals.lakes,0,256) },
      settlements: { budget: { city: clampInt(vals.budgetCity,0,32), town: clampInt(vals.budgetTown,0,64), village: clampInt(vals.budgetVillage,0,128), port: clampInt(vals.budgetPort,0,32) } },
    };
    if (Number.isFinite(vals.poiBudget) && vals.poiBudget > 0) overrides.poi = { budget: vals.poiBudget };
    if (vals.biomePack) overrides.biomePack = vals.biomePack;

    const body = { templateId: vals.template, name: vals.name || "blue_coast", autoSeed: !!vals.autoSeed, overrides };
    if (seed !== undefined) body.seed = seed;
    log("Plan body", body);
    return body;
  }

  function openPlanOverlay(){
    const old = $id("sv2PlanOverlay"); if(old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "sv2PlanOverlay";
    wrap.innerHTML = `
      <style>
        #sv2PlanOverlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center}
        #sv2PlanOverlay .back{position:absolute;inset:0;background:rgba(0,0,0,.6)}
        #sv2PlanOverlay .modal{position:relative;max-width:min(920px,90vw);width:100%;max-height:90vh;overflow:auto;background:#0f172a;color:#eff6ff;border:1px solid #334155;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
        #sv2PlanOverlay header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #1f2937;background:#111827;position:sticky;top:0;z-index:1}
        #sv2PlanOverlay .body{padding:16px;display:grid;gap:12px}
        #sv2PlanOverlay .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:10px}
        #sv2PlanOverlay .cell{display:flex;flex-direction:column;gap:4px}
        #sv2PlanOverlay label{font:600 11px/1.2 ui-sans-serif,system-ui;color:#cbd5e1}
        #sv2PlanOverlay input,#sv2PlanOverlay select{background:#0b1220;border:1px solid #334155;color:#e5e7eb;border-radius:8px;padding:8px}
        #sv2PlanOverlay .row{display:flex;gap:10px;align-items:center}
        #sv2PlanOverlay .actions{display:flex;gap:8px;justify-content:flex-end;padding:14px 16px;border-top:1px solid #1f2937;background:#0b1220;position:sticky;bottom:0}
        #sv2PlanOverlay button{border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:8px;padding:10px 14px;cursor:pointer}
        #sv2PlanOverlay button.primary{background:#2563eb;border-color:#1d4ed8}
        .note{font-size:12px;opacity:.85}
      </style>
      <div class="back"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sv2PlanTitle">
        <header>
          <h3 id="sv2PlanTitle" style="margin:0">Plan shard</h3>
          <button class="close" aria-label="Close" style="background:transparent;border:0;color:#93c5fd;font-size:20px;cursor:pointer">×</button>
        </header>
        <div class="body">
          <div id="msg" class="note"></div>
          <div class="grid">
            <div class="cell" style="grid-column: span 4">
              <label>Template</label>
              <select id="pl_template"></select>
              <div id="pl_grid_note" class="note"></div>
            </div>
            <div class="cell" style="grid-column: span 4">
              <label>Name</label>
              <input id="pl_name" placeholder="blue_coast"/>
            </div>
            <div class="cell" style="grid-column: span 4">
              <label>Seed</label>
              <div class="row">
                <input id="pl_seed" inputmode="numeric" placeholder="########" style="flex:1"/>
                <label class="row" style="gap:6px"><input id="pl_autoseed" type="checkbox" checked/> Auto-seed</label>
              </div>
            </div>

            <div class="cell" style="grid-column: span 4">
              <label>Coast width (N or N–M)</label>
              <input id="pl_coast" placeholder="1-2" />
            </div>
            <div class="cell" style="grid-column: span 4">
              <label>World type</label>
              <select id="pl_world">
                <option value="mixed">mixed</option>
                <option value="continent">continent</option>
                <option value="archipelago">archipelago</option>
              </select>
            </div>
            <div class="cell" style="grid-column: span 4">
              <label>Landmass %</label>
              <input id="pl_land" type="number" min="5" max="90" value="44"/>
            </div>

            <div class="cell"><label>Octaves</label><input id="pl_oct" type="number" min="1" max="8" value="4"/></div>
            <div class="cell"><label>Freq</label><input id="pl_freq" type="number" step="0.1" min="0.2" max="8" value="1.3"/></div>
            <div class="cell"><label>Lacunarity</label><input id="pl_lac" type="number" step="0.1" min="1.2" max="4" value="2"/></div>
            <div class="cell"><label>Gain</label><input id="pl_gain" type="number" step="0.05" min="0.1" max="0.9" value="0.5"/></div>
            <div class="cell"><label>Smooth iters</label><input id="pl_smooth" type="number" min="0" max="4" value="1"/></div>

            <div class="cell"><label>Desired rivers (0=auto)</label><input id="pl_rivers" type="number" min="0" max="256" value="0"/></div>
            <div class="cell"><label>Desired lakes (0=auto)</label><input id="pl_lakes" type="number" min="0" max="256" value="0"/></div>

            <div class="cell"><label>City budget</label><input id="pl_b_city" type="number" min="0" max="32" value="1"/></div>
            <div class="cell"><label>Town budget</label><input id="pl_b_town" type="number" min="0" max="64" value="2"/></div>
            <div class="cell"><label>Village budget</label><input id="pl_b_vil" type="number" min="0" max="128" value="4"/></div>
            <div class="cell"><label>Port budget</label><input id="pl_b_port" type="number" min="0" max="32" value="1"/></div>

            <div class="cell"><label>POI budget</label><input id="pl_poi" type="number" min="0" max="128" value="3"/></div>
            <div class="cell" style="grid-column: span 3"><label>Biome pack (optional)</label><input id="pl_biome"/></div>
          </div>
        </div>
        <div class="actions">
          <button id="pl_cancel">Cancel</button>
          <button id="pl_submit" class="primary">Submit Plan</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const $ = (sel)=>wrap.querySelector(sel);
    const msg = $("#msg");
    const tplSel = $("#pl_template");
    const gridNote = $("#pl_grid_note");
    const close = ()=> wrap.remove();
    wrap.querySelector(".back").addEventListener("click", close);
    wrap.querySelector(".close").addEventListener("click", close);
    window.addEventListener("keydown", (e)=>{ if(e.key==="Escape") close(); }, { once:true });

    const tiersLoaded = (async () => {
      const tiers = await fetchTiers();
      tplSel.innerHTML = "";
      for (const t of tiers) {
        const opt = document.createElement("option");
        opt.value = t.id; opt.textContent = t.label || t.id;
        tplSel.appendChild(opt);
      }
      function apply(tier){
        gridNote.textContent = tier?.grid ? `Grid locked by template: ${tier.grid.width}×${tier.grid.height}` : "";
        const d = tier?.defaults || {};
        $("#pl_coast").value = Array.isArray(d?.water?.coast_width) ? `${d.water.coast_width[0]}-${d.water.coast_width[1]}` : ($("#pl_coast").value || "1-2");
        if (d.world?.type) $("#pl_world").value = d.world.type;
        if (typeof d.world?.landmass_ratio === "number") $("#pl_land").value = Math.round(d.world.landmass_ratio * 100);
        if (d.noise?.octaves) $("#pl_oct").value = d.noise.octaves;
        if (d.noise?.frequency) $("#pl_freq").value = d.noise.frequency;
        if (d.noise?.lacunarity) $("#pl_lac").value = d.noise.lacunarity;
        if (d.noise?.gain) $("#pl_gain").value = d.noise.gain;
        if (d.noise?.smooth_iters !== undefined) $("#pl_smooth").value = d.noise.smooth_iters;
        if (d.hydrology?.desired_rivers !== undefined) $("#pl_rivers").value = d.hydrology.desired_rivers;
        if (d.hydrology?.desired_lakes  !== undefined) $("#pl_lakes").value  = d.hydrology.desired_lakes;
        const B = d.settlements?.budget || {};
        if (B.city !== undefined) $("#pl_b_city").value = B.city;
        if (B.town !== undefined) $("#pl_b_town").value = B.town;
        if (B.village !== undefined) $("#pl_b_vil").value = B.village;
        if (B.port !== undefined) $("#pl_b_port").value = B.port;
        if (d.poi?.budget !== undefined) $("#pl_poi").value = d.poi.budget;
        if (d.biomes?.pack) $("#pl_biome").value = d.biomes.pack;
      }
      if (tiers.length) apply(tiers[0]);
      tplSel.addEventListener("change", ()=> {
        const t = tiers.find(x => x.id === tplSel.value);
        if (t) apply(t);
      });
    })();

    $("#pl_autoseed").addEventListener("change",()=> $("#pl_seed").toggleAttribute("disabled", $("#pl_autoseed").checked));

    $("#pl_cancel").addEventListener("click", close);
    $("#pl_submit").addEventListener("click", async ()=> {
      await tiersLoaded;
      msg.textContent = "Submitting…";
      const vals = {
        template: tplSel.value,
        name: $("#pl_name").value.trim() || "blue_coast",
        autoSeed: $("#pl_autoseed").checked,
        seed: $("#pl_seed").value.trim(),
        coastWidth: $("#pl_coast").value.trim() || "1-2",
        worldType: $("#pl_world").value,
        landPct: clampInt($("#pl_land").value, 5, 90),
        octaves: clampInt($("#pl_oct").value, 1, 8),
        freq: Number($("#pl_freq").value || 1.3),
        lacunarity: Number($("#pl_lac").value || 2),
        gain: Number($("#pl_gain").value || 0.5),
        smooth: clampInt($("#pl_smooth").value, 0, 4),
        rivers: clampInt($("#pl_rivers").value, 0, 256),
        lakes: clampInt($("#pl_lakes").value, 0, 256),
        budgetCity: clampInt($("#pl_b_city").value, 0, 32),
        budgetTown: clampInt($("#pl_b_town").value, 0, 64),
        budgetVillage: clampInt($("#pl_b_vil").value, 0, 128),
        budgetPort: clampInt($("#pl_b_port").value, 0, 32),
        poiBudget: clampInt($("#pl_poi").value, 0, 128),
        biomePack: $("#pl_biome").value.trim(),
      };
      // seed adjust
      if (!vals.autoSeed && vals.seed) vals.seed = Number(vals.seed);

      const body = buildPlanBody(vals);
      try {
        const resp = await postJSON("/api/shard-gen-v2/plan", body);
        SV2.state.lastPlanBody = body;
        SV2.state.lastPlanResp = resp;
        msg.textContent = "Plan OK — you can Generate now.";
        setStatus(`Planned: ${resp.planId ?? resp.plan_id ?? "(id)"} • grid ${resp?.grid?.width ?? "?"}×${resp?.grid?.height ?? "?"}`);
        if (els.genBtn) els.genBtn.disabled = false;
        setTimeout(close, 400);
      } catch (e) {
        msg.textContent = `Plan failed: ${e.message}`;
        setStatus(`Plan failed: ${e.message}`);
      }
    });
  }

  async function doGenerateFromPlan(){
    try{
      const body = SV2.state.lastPlanBody || null;
      if (!body) return openPlanOverlay();
      const resp = await postJSON("/api/shard-gen-v2/generate", body);
      SV2.state.lastGenResp = resp;
      setStatus(`Generated: ${resp.file || resp.path || "new shard"}`);
      if (resp?.path) {
        const shard = await getJSON(resp.path).catch(()=>null);
        if (shard) renderAll(shard);
        populateList(); // refresh list with newly saved shard, if any
      }
    }catch(e){
      setStatus(`Generate failed: ${e.message}`);
      err("generate error", e);
    }
  }

  els.planBtn?.addEventListener("click",(e)=>{ e.preventDefault(); e.stopImmediatePropagation(); openPlanOverlay(); }, true);
  els.genBtn?.addEventListener("click",(e)=>{ e.preventDefault(); e.stopImmediatePropagation(); doGenerateFromPlan(); }, true);
  if (els.genBtn) els.genBtn.disabled = true;

  // ================ boot ================
  (async () => {
    setStatus("Booting viewer v2…");
    if (els.biomes) els.biomes.checked = true;
    const n = await populateList();
    if (n > 0) loadSelectedShard(); else setStatus("No shards found. Plan + Generate a shard to begin.");
  })();

  setStatus("v2 overlay ready");
})();
