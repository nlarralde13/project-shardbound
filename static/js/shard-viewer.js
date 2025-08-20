// ===== Try to import biome registry (with a fallback + minimal defaults)
const FALLBACK_COLORS = {
  Ocean:'#0b3d91', Coast:'#6fb1d6', Reef:'#2aa9db', River:'#1d6fa5', Lake:'#2c78b7',
  Wetland:'#3d9ea3', Plains:'#6fbf73', Savanna:'#7fbf4d', Shrubland:'#5fa15a', Forest:'#2d7f3b',
  Taiga:'#2a6b3a', Jungle:'#1f6b3a', Hills:'#6c757d', Mountains:'#8d99ae',
  Alpine:'#c8d3e8', Glacier:'#e0f3ff', Tundra:'#b8c7d6', DesertSand:'#d8b66c',
  DesertRock:'#b09564', Volcano:'#933a16', LavaField:'#6b2d1a', Cave:'#3a3a3a', Urban:'#607d8b'
};
let BIOME_COLORS = FALLBACK_COLORS;
let ALL_BIOME_KEYS = Object.keys(FALLBACK_COLORS);
try {
  const mod = await import('/static/js/biomeRegistry.js').catch(() => import('/static/biomeRegistry.js'));
  if (mod?.BIOME_COLORS) BIOME_COLORS = mod.BIOME_COLORS;
  if (mod?.ALL_BIOME_KEYS) ALL_BIOME_KEYS = mod.ALL_BIOME_KEYS;
} catch {}

// ===== DOM
const shardSelect = document.getElementById('shardSelect');
const btnLoad     = document.getElementById('btnLoad');
const statusEl    = document.getElementById('status');

const scaleEl     = document.getElementById('scale');
const gridEl      = document.getElementById('grid');
const autoFitEl   = document.getElementById('autoFit');
const crtModeEl   = document.getElementById('crtMode');

const frame   = document.getElementById('frame');
const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d', { alpha:false });
const tip     = document.getElementById('tooltip');

const btnFit    = document.getElementById('btnFit');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut= document.getElementById('btnZoomOut');

const legend  = document.getElementById('legend');
const legend2 = document.getElementById('legend2');

// Generate inputs
const presetEl     = document.getElementById('preset');
const baseNameEl   = document.getElementById('baseName');
const autoSeedEl   = document.getElementById('autoSeed');
const seedIdEl     = document.getElementById('seedId');
const btnReroll    = document.getElementById('btnReroll');
const widthEl      = document.getElementById('width');
const heightEl     = document.getElementById('height');
const landmassEl   = document.getElementById('landmass');
const landmassVal  = document.getElementById('landmassVal');
const portsEl      = document.getElementById('ports');
const settlementsEl= document.getElementById('settlements');
const volcanoEnabledEl = document.getElementById('volcanoEnabled');
const volMinEl     = document.getElementById('volMin');
const volMaxEl     = document.getElementById('volMax');
const biomeChecks  = document.getElementById('biomeChecks');
const btnGenerate  = document.getElementById('btnGenerate');

// ===== State
let shard = null;          // normalized: { meta:{width,height}, tiles, pois }
let scale = 8;             // px per tile
let baseScale = 8;         // "fit" scale for current frame size
let camX = 0, camY = 0;    // top-left world coords (tiles)
let dragging = false, lastX=0, lastY=0;
const MIN_SCALE = 1, MAX_SCALE = 64;

// ===== Legend
function drawLegend(host){
  host.innerHTML='';
  for (const [k,c] of Object.entries(BIOME_COLORS)){
    const el = document.createElement('span');
    el.className='swatch';
    el.innerHTML = `<span class="dot" style="background:${c}"></span>${k}`;
    host.appendChild(el);
  }
}
drawLegend(legend); drawLegend(legend2);

// ===== Canonicalize biome keys
const CANON = {}; for (const k of ALL_BIOME_KEYS) CANON[k.toLowerCase()] = k;
function canonBiome(b){
  if (!b) return 'Ocean';
  const s = String(b);
  const a = s.toLowerCase().replace(/\s+/g,'');
  const b2= s.toLowerCase().replace(/[_-]/g,'');
  return CANON[a] || CANON[b2] || s;
}

// ===== Normalize shard JSON -> {meta, tiles, pois}
function normalize(json){
  const meta = json.meta || {};
  let tiles;
  if (Array.isArray(json.grid)) {
    tiles = json.grid.map(row => row.map(b => ({ biome: canonBiome(b) })));
  } else if (Array.isArray(json.tiles)) {
    tiles = json.tiles.map(row => row.map(cell => {
      const b = typeof cell === 'string' ? cell : (cell?.biome || cell?.type || cell?.tag);
      return { ...cell, biome: canonBiome(b) };
    }));
  } else {
    throw new Error('No grid/tiles in shard');
  }
  const width  = meta.width  ?? tiles[0].length;
  const height = meta.height ?? tiles.length;
  const pois = (json.sites || json.pois || []).map(p => ({
    x: p.x ?? p.pos?.[0] ?? 0,
    y: p.y ?? p.pos?.[1] ?? 0,
    type: p.type || 'poi',
    name: p.name
  }));
  return { meta: { ...meta, width, height }, tiles, pois };
}

// ===== Canvas sizing / fit
function resizeCanvasToFrame(){
  const r = frame.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width  = Math.round(r.width*dpr);
  canvas.height = Math.round(r.height*dpr);
  canvas.style.width  = r.width+'px';
  canvas.style.height = r.height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (shard){
    baseScale = Math.max(1, Math.min(r.width/shard.meta.width, r.height/shard.meta.height));
    if (autoFitEl.checked || Math.abs(scale-baseScale)/baseScale < 0.02) {
      scale = baseScale; centerCamera();
    }
    render();
  }
}

function centerCamera(){
  const r = frame.getBoundingClientRect();
  const vw = r.width/scale, vh = r.height/scale;
  camX = Math.max(0, (shard.meta.width  - vw)/2);
  camY = Math.max(0, (shard.meta.height - vh)/2);
  clampCam();
}
function clampCam(){
  const r = frame.getBoundingClientRect();
  const vw = r.width/scale, vh = r.height/scale;
  camX = Math.max(0, Math.min(shard.meta.width  - vw, camX));
  camY = Math.max(0, Math.min(shard.meta.height - vh, camY));
}

// ===== Render (fills the box)
function render(){
  if (!shard) return;
  const r = frame.getBoundingClientRect();
  ctx.clearRect(0,0,r.width,r.height);

  const w = shard.meta.width, h = shard.meta.height;
  const vw = r.width/scale,   vh = r.height/scale;
  const x0 = Math.max(0, Math.floor(camX));
  const y0 = Math.max(0, Math.floor(camY));
  const x1 = Math.min(w, Math.ceil(camX + vw));
  const y1 = Math.min(h, Math.ceil(camY + vh));

  // bg
  ctx.fillStyle = '#0a0f1f';
  ctx.fillRect(0,0,r.width,r.height);

  ctx.save();
  ctx.translate(-camX*scale, -camY*scale);

  // tiles
  for (let y=y0; y<y1; y++){
    const row = shard.tiles[y];
    for (let x=x0; x<x1; x++){
      const biome = row?.[x]?.biome || 'Ocean';
      ctx.fillStyle = BIOME_COLORS[biome] || '#222';
      ctx.fillRect(x*scale, y*scale, scale, scale);
    }
  }

  // grid
  if (gridEl.checked){
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    for (let x=x0; x<=x1; x++){
      const px = x*scale + 0.5;
      ctx.beginPath(); ctx.moveTo(px, y0*scale); ctx.lineTo(px, y1*scale); ctx.stroke();
    }
    for (let y=y0; y<=y1; y++){
      const py = y*scale + 0.5;
      ctx.beginPath(); ctx.moveTo(x0*scale, py); ctx.lineTo(x1*scale, py); ctx.stroke();
    }
  }

  // POIs
  ctx.lineWidth = Math.max(1, scale/6); ctx.strokeStyle = '#98f3ff';
  for (const p of (shard.pois||[])){
    if (p.x<x0 || p.x>=x1 || p.y<y0 || p.y>=y1) continue;
    const px = p.x*scale + scale/2, py = p.y*scale + scale/2;
    ctx.beginPath(); ctx.arc(px,py,Math.max(3,scale*0.35),0,Math.PI*2); ctx.stroke();
  }

  ctx.restore();
}

// ===== Hover tooltip
frame.addEventListener('mousemove', (e)=>{
  if (!shard || dragging) { tip.style.display='none'; return; }
  const rect = frame.getBoundingClientRect();
  const tileX = Math.floor(camX + (e.clientX-rect.left)/scale);
  const tileY = Math.floor(camY + (e.clientY-rect.top)/scale);
  const row = shard.tiles[tileY]; const cell = row?.[tileX];
  if (!cell){ tip.style.display='none'; return; }
  const pois = (shard.pois||[]).filter(p=>p.x===tileX && p.y===tileY);
  tip.style.display='block';
  tip.style.left = e.clientX - rect.left + 'px';
  tip.style.top  = e.clientY - rect.top  + 'px';
  tip.innerHTML = `(${tileX}, ${tileY}) — ${cell.biome}${pois.length?`<br>POIs: ${pois.map(p=>p.type).join(', ')}`:''}`;
});
frame.addEventListener('mouseleave', ()=> tip.style.display='none');

// ===== Pan / Zoom helpers
function zoomAroundViewportCenter(mult){
  const r = frame.getBoundingClientRect(), sx=r.width/2, sy=r.height/2;
  const wx = camX + sx/scale, wy = camY + sy/scale;
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale*mult));
  if (next === scale) return;
  scale = next;
  camX = wx - sx/scale; camY = wy - sy/scale; clampCam(); render();
}

// Pointer pan/zoom
frame.addEventListener('pointerdown', e => {
  frame.setPointerCapture(e.pointerId);
  dragging = true; tip.style.display='none'; lastX=e.clientX; lastY=e.clientY;
});
frame.addEventListener('pointermove', e => {
  if (!dragging || !shard) return;
  const dx = (e.clientX-lastX)/scale, dy = (e.clientY-lastY)/scale;
  lastX=e.clientX; lastY=e.clientY;
  camX -= dx; camY -= dy; clampCam(); render();
});
['pointerup','pointercancel','pointerleave'].forEach(ev => frame.addEventListener(ev, ()=> dragging=false));

frame.addEventListener('wheel', e => {
  if (!shard) return; e.preventDefault();
  const rect = frame.getBoundingClientRect();
  const sx = e.clientX-rect.left, sy = e.clientY-rect.top;
  const wx = camX + sx/scale, wy = camY + sy/scale;
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (e.deltaY>0 ? 1/1.2 : 1.2)));
  if (next === scale) return;
  scale = next;
  camX = wx - sx/scale; camY = wy - sy/scale; clampCam(); render();
}, { passive:false });

// Overlay buttons
btnZoomIn.addEventListener('click', ()=> zoomAroundViewportCenter(1.2));
btnZoomOut.addEventListener('click', ()=> zoomAroundViewportCenter(1/1.2));
btnFit.addEventListener('click', ()=> { if(shard){ autoFitEl.checked = true; resizeCanvasToFrame(); } });

// Viewer controls
scaleEl.addEventListener('change', ()=>{
  if (!shard) return;
  const v = Math.max(1, Math.min(64, Number(scaleEl.value)||8));
  autoFitEl.checked = false; scale = v; clampCam(); render();
});
gridEl.addEventListener('change', ()=> render());
autoFitEl.addEventListener('change', ()=> { if(shard) resizeCanvasToFrame(); });
window.addEventListener('resize', resizeCanvasToFrame);

// ===== CRT mode (toggle + persistence)
const CRT_KEY = 'sv.crt';
function applyCRT(on){
  frame.classList.toggle('crt', !!on);
  crtModeEl.checked = !!on;
  localStorage.setItem(CRT_KEY, on ? '1' : '0');
}
crtModeEl.addEventListener('change', ()=> applyCRT(crtModeEl.checked));

// ===== API: shards
async function listShards(){
  const res = await fetch('/api/shards');
  if (!res.ok) throw new Error('list failed');
  return res.json();
}
function populateSelect(items){
  shardSelect.innerHTML='';
  for (const it of items){
    const file = it.file || it;
    const meta = it.meta || {};
    const label = meta.displayName || file.replace(/^[0-9]{8}_/,'').replace(/_/g,' ').replace(/\.json$/,'');
    const opt = document.createElement('option');
    opt.value = (it.path || `/static/public/shards/${file}`).replace(/\.json$/,'');
    opt.dataset.filename = file;
    opt.textContent = `${label} (${file})`;
    shardSelect.appendChild(opt);
  }
}
async function loadSelected(){
  const sel = shardSelect.selectedOptions[0]; if (!sel) return;
  const nameNoExt = sel.value.split('/').pop();
  setStatus('Loading…');
  const res = await fetch(`/api/shards/${encodeURIComponent(nameNoExt)}`);
  if (!res.ok){ setStatus('Failed to load shard'); return; }
  const json = await res.json();
  shard = normalize(json);
  resizeCanvasToFrame();
  setStatus(`Loaded ${json.meta?.displayName || nameNoExt}`);
}
btnLoad.addEventListener('click', loadSelected);
shardSelect.addEventListener('dblclick', loadSelected);

// ===== API: registry + generator
function syncSeedUI(){ const auto=autoSeedEl.checked; seedIdEl.disabled=auto; btnReroll.disabled=auto; }
autoSeedEl.addEventListener('change', syncSeedUI);
landmassEl.addEventListener('input', ()=> landmassVal.textContent = landmassEl.value+'%');

async function uniqueSeed(){
  const list = await listShards().catch(()=>[]);
  const used = new Set((Array.isArray(list)?list:[]).map(it=>it.file||it)
    .map(f => { const m=/^(\d{8})_/.exec(f||''); return m?Number(m[1]):null; })
    .filter(n=>Number.isInteger(n)));
  let s=0; do{ s = Math.floor(10_000_000 + Math.random()*90_000_000); } while(used.has(s));
  return s;
}
btnReroll.addEventListener('click', async ()=> seedIdEl.value = await uniqueSeed());

async function loadRegistry(){
  try{
    const res = await fetch('/api/registry');
    const data = res.ok ? await res.json() : { presets:[] };
    const presets = data.presets || [];
    presetEl.innerHTML='';
    presets.forEach(p => {
      const opt=document.createElement('option'); opt.value=p.key; opt.textContent=p.key; presetEl.appendChild(opt);
    });
    if (!baseNameEl.value) baseNameEl.value = 'shard_fire_island';

    // Biome checkboxes (skip liquids)
    const skip = new Set(['Ocean','Coast','River','Lake','Reef']);
    biomeChecks.innerHTML='';
    ALL_BIOME_KEYS.filter(k=>!skip.has(k)).forEach(k=>{
      const id='bio_'+k;
      const lab=document.createElement('label');
      const checked = ['Plains','Forest','Hills','Mountains','Volcano'].includes(k) ? 'checked' : '';
      lab.innerHTML=`<input type="checkbox" id="${id}" value="${k}" ${checked}/> ${k}`;
      biomeChecks.appendChild(lab);
    });
  }catch{}
}

async function generateAndLoad(){
  let seed = Number(seedIdEl.value||0);
  if (autoSeedEl.checked || !Number.isInteger(seed) || seed<10000000 || seed>99999999){
    seed = await uniqueSeed();
    seedIdEl.value = seed; autoSeedEl.checked = true; syncSeedUI();
  }
  const template = presetEl.value || 'shard_isle_of_cinder';
  const nameBase = (baseNameEl.value || template).replace(/\s+/g,'_').toLowerCase();
  const chosenBiomes = [...biomeChecks.querySelectorAll('input:checked')].map(i=>i.value);

  const payload = {
    template,
    name: nameBase,
    seedId: seed,
    autoSeed: true,
    overrides: {
      seed,
      width: Number(widthEl.value||64),
      height:Number(heightEl.value||64),
      landmass_ratio: Number(landmassEl.value||44)/100,
      biomes: chosenBiomes,
      volcano: { enabled: volcanoEnabledEl.checked, min_radius:Number(volMinEl.value||2), max_radius:Number(volMaxEl.value||4) },
      ports: { count: Number(portsEl.value||2) },
      settlements: { count: Number(settlementsEl.value||3) }
    }
  };

  setStatus('Generating…');
  const res = await fetch('/api/generate_shard', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const out = await res.json();
  if (!res.ok || !out.ok){ setStatus('Generate failed'); console.error(out); return; }

  const items = await listShards().catch(()=>[]);
  populateSelect(items);
  const just = out.file.replace(/\.json$/,'');
  const opt = [...shardSelect.options].find(o => (o.dataset.filename||'').replace(/\.json$/,'') === just);
  if (opt){ opt.selected = true; }
  await loadSelected();
}
btnGenerate.addEventListener('click', generateAndLoad);

// ===== Splitter (resizable left panel)
const splitRoot = document.querySelector('.wrap');
const gutter = document.getElementById('gutter');
const LEFT_KEY = 'sv.leftWidthPx';
const MIN_LEFT = 320;
const MAX_LEFT = () => Math.min(window.innerWidth - 420, 960);

function setLeftWidth(px, {save=true} = {}){
  const clamped = Math.max(MIN_LEFT, Math.min(MAX_LEFT(), Math.round(px)));
  splitRoot.style.setProperty('--left-col', clamped + 'px');
  if (save) localStorage.setItem(LEFT_KEY, String(clamped));
  resizeCanvasToFrame();
}
(function initLeftWidth(){
  const saved = parseInt(localStorage.getItem(LEFT_KEY), 10);
  if (Number.isFinite(saved)) setLeftWidth(saved, {save:false});
})();

let draggingSplit = false;
gutter.addEventListener('pointerdown', (e)=>{
  gutter.setPointerCapture(e.pointerId);
  draggingSplit = true;
});
window.addEventListener('pointermove', (e)=>{
  if (!draggingSplit) return;
  const rootLeft = splitRoot.getBoundingClientRect().left;
  const newWidth = e.clientX - rootLeft;
  setLeftWidth(newWidth);
});
['pointerup','pointercancel','blur'].forEach(ev=>{
  window.addEventListener(ev, ()=> draggingSplit = false);
});
gutter.addEventListener('keydown', (e)=>{
  const cur = parseFloat(getComputedStyle(splitRoot).getPropertyValue('--left-col'));
  if (e.key === 'ArrowLeft')  setLeftWidth(cur - 16);
  if (e.key === 'ArrowRight') setLeftWidth(cur + 16);
  if (e.key === 'Home')       setLeftWidth(360);
  if (e.key === 'End')        setLeftWidth(MAX_LEFT());
});
gutter.addEventListener('dblclick', ()=> setLeftWidth(500));
window.addEventListener('resize', ()=>{
  const current = parseFloat(getComputedStyle(splitRoot).getPropertyValue('--left-col'));
  setLeftWidth(Math.min(current, MAX_LEFT()), {save:false});
});

// ===== Keyboard shortcuts: + / - for zoom (ignore when typing in inputs)
function isTypingTarget(el){
  const tag = (el?.tagName || '').toLowerCase();
  const editable = el?.isContentEditable;
  return editable || tag === 'input' || tag === 'select' || tag === 'textarea';
}
window.addEventListener('keydown', (e)=>{
  if (!shard) return;
  if (isTypingTarget(document.activeElement)) return;

  if (e.key === '+' || e.key === '='){ // '=' is same key w/out shift on many layouts
    e.preventDefault(); zoomAroundViewportCenter(1.2);
  }
  if (e.key === '-' || e.key === '_'){
    e.preventDefault(); zoomAroundViewportCenter(1/1.2);
  }
});

// ===== Init
function setStatus(t){ statusEl.textContent = t; }
(async function init(){
  try{
    const items = await listShards();
    populateSelect(items);
    await loadRegistry();

    // Restore CRT preference
    const crtSaved = localStorage.getItem(CRT_KEY);
    applyCRT(crtSaved === '1');

    syncSeedUI();
    if (!seedIdEl.value) seedIdEl.value = await uniqueSeed();
    if (shardSelect.options.length) await loadSelected();
  }catch(e){
    console.error(e); setStatus('Init failed');
  }
  resizeCanvasToFrame();
})();
