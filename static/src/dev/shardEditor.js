import {
  editorState, beginBatch, pushChange, commitBatch,
  setSelectedPoint, setRectSelection, rectTiles,
  undo, redo
} from './editorState.js';
import { biomeRegistry } from '../data/biomeRegistry.js';
import { tileMetadataSchema } from '../data/metadataSchema.js';

const PIXI = (globalThis && (globalThis.PIXI || (window && window.PIXI))) || null;

export function initShardEditor({
  root = '#rightBar',
  overlayRoot = '#mapViewer',
  pixi,
  shard,
  tileW = 16,
  tileH = 8,
  originProvider,
} = {}) {
  const host = typeof root === 'string' ? document.querySelector(root) : root;
  const overlayHost = typeof overlayRoot === 'string' ? document.querySelector(overlayRoot) : overlayRoot;
  if (!host) throw new Error('[shardEditor] host not found');

  const panel = document.createElement('div');
  panel.className = 'panelBox';
  panel.style.width = '100%';
  panel.style.maxWidth = '100%';
  panel.style.margin = '0 auto';
  panel.style.pointerEvents = 'auto';
  host.innerHTML = '';
  host.appendChild(panel);

  panel.innerHTML = `
    <div class="panel-toggle"><strong>Shard Editor</strong></div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin:6px 0;">
      <button id="toolPan"   class="vp-action">Pan (H)</button>
      <button id="toolBrush" class="vp-action">Brush (P)</button>
      <button id="toolDrop"  class="vp-action">Eyedropper</button>
      <button id="toolSel"   class="vp-action">Select</button>
      <button id="toolRect"  class="vp-action">Rect (Shift+Drag)</button>
    </div>
    <div class="panelBox" style="margin-top:6px;">
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
        <div><small>Brush</small></div>
        <div id="zoomReadout" style="opacity:.7;font:12px ui-monospace,monospace;"></div>
      </div>
      <label>Biome:
        <select id="biomePick">
          <option>water</option><option>grass</option><option>forest</option>
          <option>desert</option><option>tundra</option><option>mountain</option>
        </select>
      </label>
      <label>Size:
        <input id="brushSize" type="number" min="1" max="7" value="1" style="width:64px"/>
      </label>
      <div><small>Alt = invert</small></div>
    </div>
    <div id="metaBox" class="panelBox" style="margin-top:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <small>Tile Metadata</small>
        <small id="metaXY" style="opacity:.75;font-family:ui-monospace,monospace;"></small>
      </div>
      <div id="metaForm"></div>
      <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
        <button id="applyMeta" class="vp-action">Apply</button>
        <button id="resetDefaults" class="vp-action">Defaults</button>
        <button id="undoBtn" class="vp-action">Undo</button>
        <button id="redoBtn" class="vp-action">Redo</button>
      </div>
    </div>
  `;

  const el = (sel) => panel.querySelector(sel);
  const toolPan   = el('#toolPan');
  const biomePick = el('#biomePick');
  const brushSize = el('#brushSize');
  const toolBrush = el('#toolBrush');
  const toolDrop  = el('#toolDrop');
  const toolSel   = el('#toolSel');
  const toolRect  = el('#toolRect');
  const metaForm  = el('#metaForm');
  const metaXY    = el('#metaXY');
  const btnApply  = el('#applyMeta');
  const btnReset  = el('#resetDefaults');
  const btnUndo   = el('#undoBtn');
  const btnRedo   = el('#redoBtn');

  let panModeCallback = null;
  function onPanModeChange(cb){ panModeCallback = cb; }
  function setTool(t){
    editorState.tool = t;
    toolPan  .classList.toggle('active', t==='pan');
    toolBrush.classList.toggle('active', t==='brush');
    toolDrop .classList.toggle('active', t==='eyedropper');
    toolSel  .classList.toggle('active', t==='select');
    toolRect .classList.toggle('active', t==='rect');
    if (panModeCallback) panModeCallback(t==='pan');
  }
  toolPan  .onclick = () => setTool('pan');
  toolBrush.onclick = () => setTool('brush');
  toolDrop .onclick = () => setTool('eyedropper');
  toolSel  .onclick = () => setTool('select');
  toolRect .onclick = () => setTool('rect');
  window.addEventListener('keydown', (e)=>{
    const k = e.key.toLowerCase();
    if (k==='h') setTool('pan');
    if (k==='p') setTool('brush');
  });

  biomePick.onchange = () => (editorState.brush.biome = biomePick.value);
  brushSize.oninput  = () => (editorState.brush.size = Math.max(1, Math.min(7, Number(brushSize.value)||1)));

  function buildForm(container){
    container.innerHTML = '';
    tileMetadataSchema.forEach(section => {
      const box = document.createElement('div');
      box.style.marginBottom = '8px';
      if (section.title){
        const h = document.createElement('div');
        h.textContent = section.title;
        h.style.fontSize='12px'; h.style.opacity='.85'; h.style.margin='4px 0';
        box.appendChild(h);
      }
      const wrap = document.createElement('div');
      wrap.style.display = section.layout==='grid-2' ? 'grid' : 'block';
      if (section.layout==='grid-2'){ wrap.style.gridTemplateColumns='1fr 1fr'; wrap.style.gap='6px'; }
      (section.fields||[]).forEach(f=>{
        const row = document.createElement('label');
        row.style.display='flex'; row.style.flexDirection='column'; row.style.gap='2px'; row.style.fontSize='12px';
        row.innerHTML = `<span>${f.label}</span>`;
        let input;
        if (f.kind==='boolean'){
          input = document.createElement('input'); input.type='checkbox';
        } else if (f.kind==='enum'){
          input = document.createElement('select');
          (f.options||[]).forEach(v=> input.appendChild(new Option(v,v)));
        } else {
          input = document.createElement('input');
          input.type = (f.kind==='number') ? 'number' : 'text';
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.min!=null) input.min=f.min; if (f.max!=null) input.max=f.max; if (f.step!=null) input.step=f.step;
        }
        input.dataset.key = f.key; input.dataset.kind=f.kind;
        input.style.padding='6px'; input.style.background='rgba(0,0,0,.35)'; input.style.border='1px solid #333'; input.style.borderRadius='6px';
        row.appendChild(input); wrap.appendChild(row);
      });
      box.appendChild(wrap); container.appendChild(box);
    });
  }
  buildForm(metaForm);

  function readFormValues(){
    const out = {};
    metaForm.querySelectorAll('[data-key]').forEach(inp => {
      const key = inp.dataset.key, kind=inp.dataset.kind;
      if (kind==='boolean') out[key]=!!inp.checked;
      else if (kind==='number') out[key]=Number(inp.value)||0;
      else if (kind==='string[]') out[key]=inp.value.split(',').map(s=>s.trim()).filter(Boolean);
      else out[key]=(inp.value||'').trim();
    });
    return out;
  }
  function writeFormValues(t){
    metaXY.textContent = editorState.selected ? `(${editorState.selected.x}, ${editorState.selected.y})` : '';
    metaForm.querySelectorAll('[data-key]').forEach(inp => {
      const key = inp.dataset.key, kind=inp.dataset.kind, val = t[key];
      if (kind==='boolean') inp.checked = !!val;
      else if (kind==='string[]') inp.value = Array.isArray(val)? val.join(',') : '';
      else if (val!=null) inp.value = val;
      else inp.value='';
    });
  }

  function ensureTileSchema(t){
    if (!Array.isArray(t.tags)) t.tags = [];
    if (!Array.isArray(t.resources)) t.resources = [];
    if (t.passable == null) t.passable = true;
    if (t.landmark == null) t.landmark = 'none';
    if (t.encounterTable == null) t.encounterTable = '';
    if (!Number.isFinite(t.spawnLevel)) t.spawnLevel = 0;
    if (t.ownerFaction == null) t.ownerFaction = 'neutral';
  }

  function getTileSnap(t){
    return {
      biome: t.biome,
      type: t.type,
      elevation: t.elevation,
      passable: !!t.passable,
      resources: Array.isArray(t.resources)? [...t.resources] : [],
      tags: Array.isArray(t.tags)? [...t.tags] : [],
      landmark: t.landmark ?? 'none',
      encounterTable: t.encounterTable ?? '',
      spawnLevel: Number.isFinite(t.spawnLevel) ? t.spawnLevel : 0,
      ownerFaction: t.ownerFaction ?? 'neutral',
    };
  }

  function applyBiomeDefaults(t){
    const d = biomeRegistry[t.biome]?.defaults;
    if (!d) return;
    if (t.type==null && d.type!=null) t.type=d.type;
    if (t.elevation==null && d.elevation!=null) t.elevation=d.elevation;
    if (t.passable==null && d.passable!=null) t.passable=d.passable;
    if ((!Array.isArray(t.resources)||!t.resources.length) && Array.isArray(d.resources)) t.resources=[...d.resources];
    if ((!Array.isArray(t.tags)||!t.tags.length) && Array.isArray(d.tags)) t.tags=[...d.tags];
    if (t.landmark==null && d.landmark!=null) t.landmark=d.landmark;
    if (t.encounterTable==null && d.encounterTable!=null) t.encounterTable=d.encounterTable;
    if (t.spawnLevel==null && d.spawnLevel!=null) t.spawnLevel=d.spawnLevel;
    if (t.ownerFaction==null && d.ownerFaction!=null) t.ownerFaction=d.ownerFaction;
  }

  // Tooltip attached to overlayHost; position based on canvas rect + offsetX/Y
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position:'absolute', pointerEvents:'none', padding:'4px 6px',
    border:'1px solid #333', borderRadius:'6px',
    background:'rgba(10,10,20,.85)', color:'#eee',
    font:'12px/1.3 ui-monospace,monospace', transform:'translate(-9999px,-9999px)',
    zIndex: '9'
  });
  (overlayHost || document.body).appendChild(tooltip);

  // Rect overlay
  let overlay = null;
  if (PIXI && pixi?.world){
    overlay = new PIXI.Graphics();
    overlay.zIndex = 10_000;
    pixi.world.sortableChildren = true;
    pixi.world.addChild(overlay);
  }

  function drawDashed(g, ax,ay,bx,by, dash=8, gap=6){
    const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy)||0, nx=len?dx/len:0, ny=len?dy/len:0;
    let d=0; g.moveTo(ax,ay);
    while (d < len){
      const sx=ax+nx*d, sy=ay+ny*d;
      d=Math.min(len, d+dash);
      const ex=ax+nx*d, ey=ay+ny*d;
      g.moveTo(sx,sy); g.lineTo(ex,ey); d+=gap;
    }
  }
  function tileCornerToWorld(u,v){
    const hx = tileW/2, hy=tileH/2;
    return { x:(u-v)*hx, y:(u+v)*hy };
  }
  function renderRectOverlay(){
    if (!overlay) return;
    overlay.clear();
    const r = editorState.rectSel;
    if (!r) return;
    const A = tileCornerToWorld(r.x0,   r.y0);
    const B = tileCornerToWorld(r.x1+1, r.y0);
    const C = tileCornerToWorld(r.x1+1, r.y1+1);
    const D = tileCornerToWorld(r.x0,   r.y1+1);
    overlay.lineStyle({ width:2, color:0xffffff, alpha:0.9 });
    drawDashed(overlay, A.x,A.y, B.x,B.y);
    drawDashed(overlay, B.x,B.y, C.x,C.y);
    drawDashed(overlay, C.x,C.y, D.x,D.y);
    drawDashed(overlay, D.x,D.y, A.x,A.y);
  }

  function loadTileIntoForm(x,y){ const t = shard.tiles[y][x]; ensureTileSchema(t); writeFormValues(t); }
  function applyFormToTile(x,y, batch=true){
    const t = shard.tiles[y][x]; ensureTileSchema(t);
    const prev = getTileSnap(t);
    Object.assign(t, readFormValues());
    const next = getTileSnap(t);
    if (batch) pushChange({ x,y, kind:'metadata', prev, next });
    pixi?.markTileDirty?.(x,y);
  }
  function rerenderDirtyAll(){
    if (!pixi || !shard) return;
    pixi.markTileDirty?.(0,0);
    pixi.markTileDirty?.(shard.width-1, 0);
    pixi.markTileDirty?.(0, shard.height-1);
    pixi.markTileDirty?.(shard.width-1, shard.height-1);
  }

  btnUndo.onclick = () => { if (undo(shard)) rerenderDirtyAll(); };
  btnRedo.onclick = () => { if (redo(shard)) rerenderDirtyAll(); };
  btnApply.onclick = () => {
    beginBatch('apply-metadata'); let count=0;
    if (editorState.rectSel){ for (const {x,y} of rectTiles(shard)){ applyFormToTile(x,y,true); count++; } }
    else if (editorState.selected){ const {x,y}=editorState.selected; applyFormToTile(x,y,true); count++; }
    commitBatch(); if (count) rerenderDirtyAll();
  };
  btnReset.onclick = () => {
    beginBatch('reset-defaults'); let count=0;
    const applyReset=(x,y)=>{ const t=shard.tiles[y][x]; ensureTileSchema(t); const prev=getTileSnap(t); applyBiomeDefaults(t); const next=getTileSnap(t); pushChange({x,y,kind:'metadata',prev,next}); pixi?.markTileDirty?.(x,y); count++; };
    if (editorState.rectSel){ for (const {x,y} of rectTiles(shard)) applyReset(x,y); }
    else if (editorState.selected){ const {x,y}=editorState.selected; applyReset(x,y); }
    commitBatch(); if (count) rerenderDirtyAll();
  };

  const view = pixi?.app?.view;
  let dragging=false, rectStart=null;

  // Hover + tooltip
  view.addEventListener('pointermove', (e)=>{
    const t = pixi.tileFromEvent(e);
    const canvasRect = view.getBoundingClientRect();
    const hostRect = (overlayHost || document.body).getBoundingClientRect();
    if (t){
      const tile = shard.tiles[t.y][t.x];
      tooltip.textContent = `(${t.x}, ${t.y})` + (tile?.biome ? ` · ${tile.biome}` : '');
      const left = canvasRect.left - hostRect.left + e.offsetX + 14;
      const top  = canvasRect.top  - hostRect.top  + e.offsetY + 18;
      tooltip.style.transform = `translate(${left}px, ${top}px)`;
    } else {
      tooltip.style.transform = 'translate(-9999px,-9999px)';
    }
    if (rectStart){
      const cur = t;
      setRectSelection(rectStart.x, rectStart.y, cur?.x ?? rectStart.x, cur?.y ?? rectStart.y, shard);
      renderRectOverlay();
    }
  });
  view.addEventListener('pointerleave', ()=>{ tooltip.style.transform = 'translate(-9999px,-9999px)'; });

  // Clicks
  view.addEventListener('pointerdown', (e)=>{
    if (editorState.tool==='pan' && e.button===0 && !e.shiftKey){
      const t = pixi.tileFromEvent(e);
      if (t){ pixi.centerOnTile(t.x, t.y, 300); }
      return;
    }
    const t = pixi.tileFromEvent(e);
    if (!t) return;

    if (e.shiftKey || editorState.tool==='rect'){
      rectStart = { ...t }; setRectSelection(rectStart.x, rectStart.y, rectStart.x, rectStart.y, shard);
      dragging=true; renderRectOverlay(); return;
    }

    if (editorState.tool === 'eyedropper'){
      const tile = shard.tiles[t.y][t.x];
      if (tile?.biome){ editorState.brush.biome = tile.biome; biomePick.value = tile.biome; }
      return;
    }

    setSelectedPoint(t.x, t.y);
    loadTileIntoForm(t.x, t.y);
    pixi?.setSelected?.(t);

    if (editorState.tool === 'brush'){
      dragging=true; paintAt(t.x,t.y);
    }
  });

  window.addEventListener('pointerup', ()=>{
    dragging=false;
    if (rectStart){ rectStart=null; renderRectOverlay(); }
    commitPaintBatch();
  });

  // Paint batching + loop
  let paintBatchOpen=false;
  function beginPaintBatch(){ if (!paintBatchOpen){ beginBatch('paint'); paintBatchOpen=true; } }
  function commitPaintBatch(){ if (paintBatchOpen){ commitBatch(); paintBatchOpen=false; } }

  function paintAt(cx,cy){
    const size = Math.max(1, editorState.brush.size|0);
    beginPaintBatch();
    for (let dy = -size + 1; dy < size; dy++){
      for (let dx = -size + 1; dx < size; dx++){
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= shard.width || ty >= shard.height) continue;
        const t = shard.tiles[ty][tx]; ensureTileSchema(t);
        const prev = getTileSnap(t);
        t.biome = editorState.brush.biome;
        const d = biomeRegistry[t.biome]?.defaults;
        if (d){
          if ((!Array.isArray(t.tags)||!t.tags.length) && d.tags) t.tags=[...d.tags];
          if (t.landmark==null && d.landmark!=null) t.landmark=d.landmark;
          if (t.encounterTable==null && d.encounterTable!=null) t.encounterTable=d.encounterTable;
          if (t.spawnLevel==null && d.spawnLevel!=null) t.spawnLevel=d.spawnLevel;
          if (t.ownerFaction==null && d.ownerFaction!=null) t.ownerFaction=d.ownerFaction;
          if (t.elevation==null && d.elevation!=null) t.elevation=d.elevation;
          if ((!Array.isArray(t.resources)||!t.resources.length) && d.resources) t.resources=[...d.resources];
          if (t.passable==null && d.passable!=null) t.passable=d.passable;
        }
        const next = getTileSnap(t);
        pushChange({ x:tx, y:ty, kind:'paint', prev, next });
        pixi?.markTileDirty?.(tx,ty);
      }
    }
  }

  return { show(){panel.style.display='';}, hide(){panel.style.display='none';}, onPanModeChange };
}
