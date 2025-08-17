// shardEditorApp.js — editor 1.3.0
// Ocean-default regeneration + random seedId + keeps existing editor wiring

import { ShardGridRenderer } from './shardGridRenderer.js';

// Resolve relative/absolute imports for dynamic module loads
const ABS = (u) => (/^https?:\/\//i.test(u) ? u : new URL(u, window.location.origin).toString());
const REL = (u) => new URL(u, import.meta.url).href;

// --- small utils
const deepClone = (o) => JSON.parse(JSON.stringify(o));
function randomSeedId(len = 20) {
  try {
    const bytes = new Uint8Array(Math.ceil(len / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
  } catch {
    let s = ''; while (s.length < len) s += Math.floor(Math.random()*16).toString(16);
    return s.slice(0, len);
  }
}

// Normalize incoming shard JSON to {width,height,tiles[][]}
function normalize(json) {
  if (Array.isArray(json.tiles) && Array.isArray(json.tiles[0])) {
    json.height ??= json.tiles.length; json.width ??= json.tiles[0].length; return json;
  }
  if (Array.isArray(json.tiles) && !Array.isArray(json.tiles[0])) {
    const w=json.width|0, h=json.height|0;
    const g=new Array(h); for (let y=0;y<h;y++) g[y]=json.tiles.slice(y*w,(y+1)*w);
    return { width:w, height:h, tiles:g };
  }
  return json;
}

// Fallback RNG world (only used if fetch of default shard fails and no worldgen)
function fallbackGenerate(w=64,h=64,seed=0){
  function mul(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
  const R = mul(seed>>>0);
  const tiles = Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>{
    const n=R(); let biome='land/grassland'; if(n<0.18) biome='water/ocean';
    return { biome, seed:(y*w+x)>>>0, biomeTier:0, ownerFaction:'neutral', passable:true, tags:[], sliceOptions:{} };
  }));
  return { width:w, height:h, tiles };
}

export function startShardEditor({
  biomeRegistryPath = '/static/src/data/biomeRegistry.js',
  defaultShardUrl  = '/static/src/data/worlds/core_world/shards/A_0.json',
  worldgenPath     = '././shards/rdmShardGen.js'
} = {}) {
  // Canvas + status
  const canvas    = document.getElementById('grid');
  const statusTxt = document.getElementById('statusText');
  const setStatus = (m)=>{ if(statusTxt) statusTxt.textContent = m; };

  // Left JSON pane
  const tileJson  = document.getElementById('tileJson');
  const showJson  = (committed, staged=null)=>{
    if (!tileJson) return;
    tileJson.textContent = committed
      ? (staged ? `/* committed */\n${JSON.stringify(committed,null,2)}\n\n/* staged (not yet applied) */\n${JSON.stringify(staged,null,2)}`
                : JSON.stringify(committed,null,2))
      : '{ /* click a tile */ }';
  };

  const renderer = new ShardGridRenderer(canvas, { cell: 12 });

  // Brush UI
  const brushToggle = document.getElementById('brushToggle');
  const biomePick   = document.getElementById('biomePick');

  // Metadata inputs
  const metaBiome = document.getElementById('metaBiome');
  const metaSeed  = document.getElementById('metaSeed');
  const metaTier  = document.getElementById('metaTier');
  const metaOwner = document.getElementById('metaOwner');
  const metaPass  = document.getElementById('metaPassable');
  const metaTags  = document.getElementById('metaTags');

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

  const applyBtn    = document.getElementById('applyMeta');
  const defaultsBtn = document.getElementById('defaultsMeta');
  const centerBtn   = document.getElementById('centerBtn');

  const regenBtn    = document.getElementById('regenBtn');
  const regenW      = document.getElementById('regenW');
  const regenH      = document.getElementById('regenH');
  const regenSeed   = document.getElementById('regenSeed');
  const regenPreset = document.getElementById('regenPreset');

  let shard = null;
  let biomeRegistry = {};
  let worldgen = null;

  // Load biome registry (provides slice defaults for 'water/ocean')
  (async ()=>{
    try {
      const mod = await import(REL(biomeRegistryPath));
      biomeRegistry = mod.biomeRegistry || mod.default || {};
    } catch {
      biomeRegistry = {}; // if missing, defaultsFor() just returns {}
    }
    if (biomePick) {
      biomePick.innerHTML = Object.keys(biomeRegistry)
        .map(b=>`<option value="${b}">${b}</option>`).join('');
    }
  })();

  // Load optional worldgen (still available for non-default presets)
  (async ()=>{
    try {
      const mod = await import(REL(worldgenPath));
      worldgen = mod.generateShard || mod.generate || mod.default || null;
    } catch { worldgen = null; }
  })();

  // --- helpers bound to current registry
  const defaultsFor = (id)=> (biomeRegistry?.[id]?.sliceDefaults) || {}; // uses registry’s sliceDefaults 

  const ensureTile = (t={})=>{
    t.biome ||= 'land/grassland';
    t.seed = (t.seed|0)>>>0;
    t.biomeTier ??= 0;
    t.ownerFaction ||= 'neutral';
    if (t.passable==null) t.passable = true;
    if (!Array.isArray(t.tags)) t.tags = [];
    t.sliceOptions ||= {};
    return t;
  };

  const readMeta = ()=>({
    biome: metaBiome.value || 'land/grassland',
    seed:+metaSeed.value||0, biomeTier:+metaTier.value||0,
    ownerFaction: metaOwner.value || 'neutral',
    passable: !!metaPass.checked,
    tags: (metaTags.value||'').split(',').map(s=>s.trim()).filter(Boolean),
    sliceOptions:{
      mob_density:+optMob.value||0, dungeon_chance:+optDungeon.value||0,
      can_spawn_elite:!!optElite.checked, elite_rate:+optEliteRate.value||0,
      can_spawn_fish:!!optFish.checked,  fish_density:+optFishDen.value||0,
      boat_allowed:!!optBoat.checked,    oil_seeps:!!optOil.checked,
      coral_present:!!optCoral.checked,  pearl_rate:+optPearl.value||0,
      resources:(optResources.value||'').split(',').map(s=>s.trim()).filter(Boolean),
      subtype: optSubtype.value||''
    }
  });

  const writeMeta = (t={})=>{
    metaBiome.value=t.biome||''; metaSeed.value=t.seed??0; metaTier.value=t.biomeTier??0;
    metaOwner.value=t.ownerFaction||'neutral'; metaPass.checked=!!t.passable;
    metaTags.value=(t.tags||[]).join(', ');
    const so=t.sliceOptions||{};
    optMob.value=+so.mob_density||0; optDungeon.value=+so.dungeon_chance||0;
    optElite.checked=!!so.can_spawn_elite; optEliteRate.value=+so.elite_rate||0;
    optFish.checked=!!so.can_spawn_fish;   optFishDen.value=+so.fish_density||0;
    optBoat.checked=!!so.boat_allowed;     optOil.checked=!!so.oil_seeps;
    optCoral.checked=!!so.coral_present;   optPearl.value=+so.pearl_rate||0;
    optResources.value=(so.resources||[]).join(', ');
    optSubtype.value=so.subtype||'';
  };

  // --- selection & painting (unchanged core behavior)
  function selectTile(x,y){
    renderer.clearPreview(); // defensive: avoid ghost paint
    if (!shard) return;
    x=Math.max(0,Math.min(shard.width-1,x)); y=Math.max(0,Math.min(shard.height-1,y));
    renderer.setSelected({x,y});
    const t = ensureTile(shard.tiles[y][x]);
    writeMeta(t); showJson(t, null);
  }

  canvas.addEventListener('click', (e)=>{
    const r = canvas.getBoundingClientRect();
    const sx=e.clientX-r.left, sy=e.clientY-r.top;
    const hit = renderer.screenToTile(sx,sy);
    if (!hit) return;
    const {x,y} = hit;
    if (brushToggle?.checked){
      const staged = ensureTile(readMeta()); staged.biome = metaBiome.value || 'land/grassland';
      renderer.setPreview({ x,y, biome: staged.biome });
      showJson(ensureTile(shard.tiles[y][x]), staged);
    } else {
      selectTile(x,y);
    }
  });

  applyBtn?.addEventListener('click', ()=>{
    if (!renderer.selected || !shard) return;
    const {x,y} = renderer.selected;
    shard.tiles[y][x] = ensureTile(readMeta());
    renderer.clearPreview();
    writeMeta(shard.tiles[y][x]); showJson(shard.tiles[y][x], null);
    renderer.redraw();
  });

  defaultsBtn?.addEventListener('click', ()=>{
    const b = metaBiome.value || 'land/grassland';
    const t = ensureTile(readMeta());
    t.sliceOptions = deepClone(defaultsFor(b)); // pull defaults from registry
    writeMeta(t);
    if (brushToggle?.checked && renderer.selected) {
      renderer.setPreview({ x:renderer.selected.x, y:renderer.selected.y, biome:b });
      showJson(ensureTile(shard.tiles[renderer.selected.y][renderer.selected.x]), t);
    }
  });

  centerBtn?.addEventListener('click', ()=>{
    if (renderer.selected) renderer.centerOn(renderer.selected.x, renderer.selected.y);
    else if (shard) renderer.centerOn(Math.floor(shard.width/2), Math.floor(shard.height/2));
  });

  // --- NEW: ocean-default regeneration that uses the registry + random seedId
  async function regenerateOceanGrid(W, H){
    const oceanDefaults = deepClone(defaultsFor('water/ocean')); // uses registry ‘water/ocean’ sliceDefaults :contentReference[oaicite:2]{index=2}
    const tile = {
      biome: 'water/ocean',
      seed: 0,
      biomeTier: 0,
      ownerFaction: 'neutral',
      passable: true,
      tags: [],
      sliceOptions: oceanDefaults
    };

    const tiles = new Array(H);
    for (let y=0;y<H;y++){
      const row = new Array(W);
      for (let x=0;x<W;x++) row[x] = deepClone(tile);
      tiles[y] = row;
    }

    const next = { width: W, height: H, tiles, meta: { seedId: randomSeedId() } };
    return next;
  }

  // Regenerate button: default preset => ocean grid (registry); others => worldgen/fallback
  regenBtn?.addEventListener('click', async ()=>{
    const W=Math.max(4,(+regenW.value||64)|0), H=Math.max(4,(+regenH.value||64)|0), S=(+regenSeed.value||0)|0;
    const preset = (regenPreset?.value||'default');

    let next=null;
    try {
      if (preset === 'default') {
        next = await regenerateOceanGrid(W,H);   // <— ocean by default (your ask)
      } else if (typeof worldgen==='function') {
        // worldgen remains available for other presets
        next = await worldgen(W,H,S,preset, biomeRegistry);
      }
      if (!next?.tiles) throw 0;
    } catch {
      // if anything failed, at least give a usable grid
      next = await regenerateOceanGrid(W,H);
    }
    loadShard(next);
  });

  // --- initial load (prefer URL/default shard; fallback to RNG)
  async function loadDefault() {
    const candidates = [
      document.getElementById('fetchUrl')?.value?.trim(),
      defaultShardUrl,
      '/static/src/data/worlds/core_world/shards/A_0.json'
    ].filter(Boolean);
    try {
      const url = candidates.find(Boolean);
      const r = await fetch(url, { cache: 'no-store' });
      const json = await r.json();
      loadShard(json);
    } catch {
      loadShard(fallbackGenerate(64,64,0));
    }
  }

  function loadShard(json) {
    shard = normalize(json);
    // if missing seedId (old files), inject one so it persists on export
    shard.meta ??= {};
    shard.meta.seedId ||= randomSeedId();

    renderer.setData(shard);
    requestAnimationFrame(()=>{
      renderer.fitToShard(shard.width, shard.height, { paddingTiles:2, setAsMin:true }); // keeps your centering flow :contentReference[oaicite:3]{index=3}
      setStatus(`Loaded ${shard.width}×${shard.height} (seedId ${shard.meta.seedId})`);
      selectTile(Math.floor(shard.width/2), Math.floor(shard.height/2));
    });
  }

  loadDefault();
}

export default startShardEditor;
