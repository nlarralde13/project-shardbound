// /static/src/dev/editor/shardEditorApp.js (v5 — configurable worldgen import)
import { ShardGridRenderer } from './shardGridRenderer.js';
import { EditorState } from './shardEditorState.js';

const ORIGIN = window.location.origin;
const ROOTS = { data: '/static/src/data/' };
const ABS = (u) => (/^https?:\/\//i.test(u) ? u : new URL(u, ORIGIN).toString());
const REL_TO_MODULE = (u) => new URL(u, import.meta.url).href;

async function tryImport(candidates){
  let lastErr;
  for (const u of candidates){
    const url = u.startsWith('/') ? ABS(u) : REL_TO_MODULE(u);
    try { return await import(url); } catch(e) { lastErr = e; }
  }
  throw lastErr;
}
async function tryFetchJson(c){
  let e,u;
  for(const x of c){
    u = x.startsWith('/') ? ABS(x) : REL_TO_MODULE(x);
    try{
      const r = await fetch(u, { cache: 'no-cache' });
      if (r.ok) return { url: u, json: await r.json() };
      e = new Error(`${r.status} ${r.statusText}`);
    }catch(err){ e = err; }
  }
  throw new Error(`Failed: ${u} → ${e?.message||e}`);
}

export function startShardEditor({
  biomeRegistryPath = '/static/src/data/biomeRegistry.js',
  defaultShardUrl   = '/static/src/data/worlds/core_world/shards/A_0.json',
  worldgenPath      = '/static/src/rdmShardGen.js' // override from HTML if your repo differs
} = {}){
  const canvas    = document.getElementById('grid');
  const statusTxt = document.getElementById('statusText');

  const setStatus = (m)=> statusTxt.textContent = m;

  // Buttons/Inputs
  const fileInput   = document.getElementById('fileInput');
  const fetchBtn    = document.getElementById('fetchBtn');
  const fetchUrl    = document.getElementById('fetchUrl');
  const saveBtn     = document.getElementById('saveBtn');
  const regenBtn    = document.getElementById('regenBtn');
  const regenW      = document.getElementById('regenW');
  const regenH      = document.getElementById('regenH');
  const regenSeed   = document.getElementById('regenSeed');
  const regenPreset = document.getElementById('regenPreset');

  const biomePick   = document.getElementById('biomePick');
  const brushSize   = document.getElementById('brushSize');
  const metaBiome   = document.getElementById('metaBiome');
  const metaSeed    = document.getElementById('metaSeed');
  const metaTier    = document.getElementById('metaTier');
  const metaOwner   = document.getElementById('metaOwner');
  const metaPass    = document.getElementById('metaPassable');
  const metaTags    = document.getElementById('metaTags');
  const optMob = document.getElementById('optMob');
  const optDungeon = document.getElementById('optDungeon');
  const optElite = document.getElementById('optElite');
  const optEliteRate = document.getElementById('optEliteRate');
  const optFish = document.getElementById('optFish');
  const optFishDen = document.getElementById('optFishDen');
  const optBoat = document.getElementById('optBoat');
  const optOil = document.getElementById('optOil');
  const optCoral = document.getElementById('optCoral');
  const optPearl = document.getElementById('optPearl');
  const optResources = document.getElementById('optResources');
  const optSubtype   = document.getElementById('optSubtype');
  const applyBtn = document.getElementById('applyMeta');
  const defaultsBtn = document.getElementById('defaultsMeta');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  const fitBtn  = document.getElementById('fitBtn');
  const zinBtn  = document.getElementById('zinBtn');
  const zoutBtn = document.getElementById('zoutBtn');

  // Renderer/State
  const renderer = new ShardGridRenderer(canvas, { cell: 12 });
  const state = new EditorState();
  state.brush = { biome: 'land/grassland', size: 1 };
  let shard = null;

  // Load biome registry
  let biomeRegistry = {};
  (async ()=>{
    try{
      const mod = await tryImport([biomeRegistryPath, `${ROOTS.data}biomeRegistry.js`, '../data/biomeRegistry.js']);
      biomeRegistry = mod.biomeRegistry || {};
    }catch(e){
      console.warn('[editor] biomeRegistry failed; using fallback:', e);
      biomeRegistry = {
        'land/grassland': { sliceDefaults:{ mob_density:.05, dungeon_chance:.01, resources:['berries','fiber','clay'] } },
        'land/forest'   : { sliceDefaults:{ mob_density:.08, dungeon_chance:.02, resources:['wood','herbs','mushroom'] } },
        'water/ocean'   : { sliceDefaults:{ mob_density:.02, dungeon_chance:.002, can_spawn_fish:true, fish_density:.3, resources:['kelp','seawater','salt','oil'] } }
      };
    }
    biomePick.innerHTML = Object.keys(biomeRegistry).map(b=>`<option value="\${b}">\${b}</option>`).join('');
  })();

  // Configurable worldgen dynamic import
  let generateShard = null;
  if (regenBtn) regenBtn.disabled = true;
  (async ()=>{
    try{
      const mod = await tryImport([
        worldgenPath,                            // caller-provided
        '/static/src/rdmShardGen.js',            // project root default
        '../../shards/rdmShardGen.js'            // fallback relative to this module (common repo layout)
      ]);
      generateShard = mod.generateShard;
    }catch(e){
      console.error('[editor] failed to load rdmShardGen', e);
      setStatus('Worldgen module failed to load. Check worldgenPath in shard-editor.html');
    }finally{
      if (regenBtn) regenBtn.disabled = !generateShard;
    }
  })();

  // Helpers
  const clampSize = (v)=> Math.max(4, Math.min(500, v|0));
  regenW.value = clampSize(regenW.value || 64);
  regenH.value = clampSize(regenH.value || 64);

  const ensureTile = (t={})=>{
    t.biome ||= 'land/grassland';
    t.seed = (t.seed|0)>>>0;
    t.biomeTier ??= 0;
    t.ownerFaction ||= 'neutral';
    if (t.passable == null) t.passable = true;
    if (!Array.isArray(t.tags)) t.tags = [];
    const d = biomeRegistry?.[t.biome]?.sliceDefaults || {};
    t.sliceOptions = { ...d, ...(t.sliceOptions||{}) };
    return t;
  };
  const writeMeta = (t)=>{
    metaBiome.value = t.biome || '';
    metaSeed.value = t.seed ?? 0;
    metaTier.value = t.biomeTier ?? 0;
    metaOwner.value = t.ownerFaction || '';
    metaPass.checked = t.passable ?? true;
    metaTags.value = (t.tags||[]).join(', ');
    const o=t.sliceOptions||{};
    optMob.value=o.mob_density??0; optDungeon.value=o.dungeon_chance??0;
    optElite.checked=!!o.can_spawn_elite; optEliteRate.value=o.elite_rate??0;
    optFish.checked=!!o.can_spawn_fish; optFishDen.value=o.fish_density??0;
    optBoat.checked=!!o.boat_allowed; optOil.checked=!!o.oil_seeps;
    optCoral.checked=!!o.coral_present; optPearl.value=o.pearl_rate??0;
    optResources.value=(o.resources||[]).join(', '); optSubtype.value=o.subtype||'';
  };
  const readMeta = ()=> ({
    biome: metaBiome.value || 'land/grassland',
    seed: +metaSeed.value || 0,
    biomeTier: +metaTier.value || 0,
    ownerFaction: metaOwner.value || 'neutral',
    passable: !!metaPass.checked,
    tags: metaTags.value.split(',').map(s=>s.trim()).filter(Boolean),
    sliceOptions: {
      mob_density:+optMob.value||0, dungeon_chance:+optDungeon.value||0,
      can_spawn_elite:!!optElite.checked, elite_rate:+optEliteRate.value||0,
      can_spawn_fish:!!optFish.checked, fish_density:+optFishDen.value||0,
      boat_allowed:!!optBoat.checked, oil_seeps:!!optOil.checked,
      coral_present:!!optCoral.checked, pearl_rate:+optPearl.value||0,
      resources: optResources.value.split(',').map(s=>s.trim()).filter(Boolean),
      subtype: optSubtype.value||''
    }
  });

  function selectTile(x,y){
    if (!shard) return;
    if (x<0||y<0||x>=shard.width||y>=shard.height) return;
    state.selected = {x,y};
    const t = ensureTile(shard.tiles[y][x]); shard.tiles[y][x]=t;
    writeMeta(t); renderer.setSelected({x,y});
  }
  function paintAt(x,y){
    const t = ensureTile(shard.tiles[y][x]); const prev={...t};
    t.biome = state.brush.biome;
    const d = biomeRegistry?.[t.biome]?.sliceDefaults || {};
    t.sliceOptions = { ...d, ...t.sliceOptions };
    state.pushOp({x,y,prev,next:{...t}}); shard.tiles[y][x]=t;
  }

  // Events
  biomePick.addEventListener('change', ()=> state.brush.biome = biomePick.value);
  brushSize.addEventListener('input', ()=> state.brush.size = Math.max(1, Math.min(9, +brushSize.value||1)));

  canvas.addEventListener('click', (e)=>{
    if (!shard) return;
    const r = canvas.getBoundingClientRect();
    const t = renderer.screenToTile(e.clientX-r.left, e.clientY-r.top);
    if (!t) return; selectTile(t.x,t.y);

    state.beginBatch('paint');
    const size = Math.max(1, +brushSize.value||1), rad = (size-1)>>1;
    for (let dy=-rad; dy<=rad; dy++) for (let dx=-rad; dx<=rad; dx++){
      const tx=t.x+dx, ty=t.y+dy; if (tx<0||ty<0||tx>=shard.width||ty>=shard.height) continue;
      paintAt(tx,ty);
    }
    state.commitBatch(); renderer.redraw();
  });

  applyBtn.addEventListener('click', ()=>{
    if (!state.selected||!shard) return; const {x,y}=state.selected;
    const t=ensureTile(shard.tiles[y][x]); const prev={...t}; const next=readMeta();
    shard.tiles[y][x]={...t,...next}; state.beginBatch('applyMeta');
    state.pushOp({x,y,prev,next:{...shard.tiles[y][x]}}); state.commitBatch(); renderer.redraw();
  });
  defaultsBtn.addEventListener('click', ()=>{
    if (!state.selected||!shard) return; const {x,y}=state.selected;
    const t=ensureTile(shard.tiles[y][x]); const prev={...t};
    const d=biomeRegistry?.[t.biome]?.sliceDefaults||{}; t.sliceOptions={...d};
    state.beginBatch('defaults'); state.pushOp({x,y,prev,next:{...t}}); state.commitBatch();
    writeMeta(t); renderer.redraw();
  });
  undoBtn.addEventListener('click', ()=>{ if (state.undo(shard)) renderer.redraw(); });
  redoBtn.addEventListener('click', ()=>{ if (state.redo(shard)) renderer.redraw(); });

  // IO
  fileInput.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if (!f) return;
    try{ const json = JSON.parse(await f.text()); loadShard(normalize(json)); }
    catch(err){ alert('Invalid JSON'); console.error(err); }
    finally{ fileInput.value=''; }
  });
  fetchBtn.addEventListener('click', async ()=>{
    const u = (fetchUrl.value||'').trim(); if (!u) return alert('Enter a URL');
    try{ const {json}=await tryFetchJson([u]); loadShard(normalize(json)); }
    catch(e){ alert('Fetch failed: '+e.message); }
  });
  saveBtn.addEventListener('click', ()=>{
    if (!shard) return;
    const blob = new Blob([JSON.stringify(shard,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=(shard.id||'shard')+'.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  regenBtn.addEventListener('click', ()=>{
    if (!generateShard) { console.warn('worldgen not loaded yet'); return; }
    const w=Math.max(4,Math.min(500,+regenW.value||64));
    const h=Math.max(4,Math.min(500,+regenH.value||64));
    const s=+regenSeed.value||0; const p=regenPreset.value||'default';
    const j=generateShard(w,h,s,{preset:p}); loadShard(normalize(j));
  });

  // normalize + load
  function normalize(json){
    if (Array.isArray(json.tiles) && Array.isArray(json.tiles[0])){
      json.height ??= json.tiles.length; json.width ??= json.tiles[0].length;
      for (let y=0;y<json.tiles.length;y++){
        while (json.tiles[y].length < json.width) json.tiles[y].push({biome:'land/grassland',seed:0,sliceOptions:{}});
      }
      return json;
    }
    if (Array.isArray(json.tiles) && !Array.isArray(json.tiles[0])){
      if (!(json.width>0 && json.height>0)) throw new Error('Flat tiles need width & height');
      const g=new Array(json.height);
      for (let y=0;y<json.height;y++){
        g[y]=json.tiles.slice(y*json.width,(y+1)*json.width);
        while (g[y].length<json.width) g[y].push({biome:'land/grassland',seed:0,sliceOptions:{}});
      }
      json.tiles=g; return json;
    }
    const W=json.width||64,H=json.height||64;
    json.tiles=Array.from({length:H},()=>Array.from({length:W},()=>({biome:'land/grassland',seed:0,sliceOptions:{}})));
    json.width=W; json.height=H; return json;
  }
  function loadShard(json){
    const j=normalize(json);
    j.height ??= j.tiles.length; j.width ??= (j.tiles[0]?.length||0);
    shard=j; renderer.setData(shard);
    renderer.fitToShard(shard.width, shard.height, {paddingTiles:2});
    // select 0,0 to populate side panel
    const sx = Math.min(0, shard.width-1);
    const sy = Math.min(0, shard.height-1);
    selectTile(sx, sy);
    biomePick.value = shard.tiles[sy][sx]?.biome || biomePick.value;
    setStatus(`Loaded shard \${shard.id||''} (\${shard.width}×\${shard.height})`);
  }

  // auto-load
  fetchUrl.value ||= defaultShardUrl;
  if (fetchUrl.value) tryFetchJson([fetchUrl.value]).then(({json})=>loadShard(json)).catch(e=>setStatus('Auto-fetch failed: '+e.message));
}
