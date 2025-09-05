import { hasAt, removeAt } from './removeHelpers.js';

﻿// shard-viewer-v2 - minimal, working, debuggable overlay
// Vanilla ES module; no bundler.

(() => {
  // Utilities
  const $ = (id) => document.getElementById(id);
  const trace = (step, extra) => { try { console.log('[SV2]', step, extra ?? ''); } catch {} };
  const setStatus = (m) => { const el = $('status'); if (el) el.textContent = m; logAction(m); };
  const setDebug = (m) => { const el = $('debugBadge'); if (!el) return; el.textContent = m || ''; el.style.opacity = m ? '1' : '0'; };
  function logAction(text, extra){ try{ const logEl=$('actionLog'); if(!logEl) return; const now=new Date(); const ts=now.toLocaleTimeString([], {hour12:false}); let line=`[${ts}] ${String(text||'').trim()}`; if (extra){ try{ line += ' ' + JSON.stringify(extra); }catch{} } logEl.textContent += (line + '\n'); logEl.scrollTop = logEl.scrollHeight; }catch{} }
  function markUnsaved(){ const b=$('btnPushLive'); if(b){ b.disabled=true; b.classList.add('is-dim'); } const b2=$('btnTilePush'); if(b2){ b2.disabled=true; b2.classList.add('is-dim'); } }
  function markReadyToPush(){ const b=$('btnPushLive'); if(b){ b.disabled=false; b.classList.remove('is-dim'); } const b2=$('btnTilePush'); if(b2){ b2.disabled=false; b2.classList.remove('is-dim'); }
    setStatus('Draft saved. Push Live enabled.'); }

  let raf=0;
  function scheduleDraw(){
    if(raf) return;
    raf=requestAnimationFrame(()=>{ raf=0; drawBase(); drawOverlay(); });
  }

  // Elements
  const els = {
    frame: $('frame'),
    base:  $('canvas'),
    select: $('shardSelect'),
    loadBtn: $('btnLoad'),
    scale: $('scale'), grid:$('grid'), autoFit:$('autoFit'), opacity:$('overlayOpacity'),
    palette: $('palette'),
    layerBiomes: $('layerBiomes'),
    layerInfra: $('layerInfra'),
    layerSettlements: $('layerSettlements'),
    layerShardgates: $('layerShardgates'),
    // Tile info panel
    tilePanel: $('tileInfoPanel'),
    tileCoord: $('tileCoord'),
    tileJson: $('tileJson'),
    tileContext: $('tileContext'),
    tileValidateOut: $('tileValidateOut'),
    btnTileApply: $('btnTileApply'),
    btnTileValidate: $('btnTileValidate'),
    btnTilePush: $('btnTilePush')
  };
  if (!els.base) { const c=document.createElement('canvas'); c.id='canvas'; els.frame?.appendChild(c); els.base=c; }

  // Overlay canvas
  const overlay = document.createElement('canvas'); overlay.id='overlayCanvasV2'; overlay.style.pointerEvents='none';
  els.frame?.appendChild(overlay); const octx = overlay.getContext('2d');
  const dpr = () => window.devicePixelRatio || 1;
  const scale = () => Math.max(1, parseInt(els.scale?.value||'8',10));
  const alpha = () => Math.max(0, Math.min(1,(parseInt(els.opacity?.value||'85',10)||85)/100));

  const linkBanner=document.createElement('div');
  linkBanner.id='linkBanner';
  Object.assign(linkBanner.style,{position:'absolute',top:'0',left:'0',right:'0',background:'rgba(0,0,0,0.7)',color:'#fff',padding:'4px',textAlign:'center',display:'none',zIndex:'1000'});
  const cancelLink=document.createElement('button'); cancelLink.textContent='Cancel'; cancelLink.style.marginLeft='8px';
  linkBanner.appendChild(document.createTextNode('Link mode: select target'));
  linkBanner.appendChild(cancelLink);
  document.body.appendChild(linkBanner);
  cancelLink.addEventListener('click',()=>{ ST.linkSource=null; ST.linkSourceId=null; ST.hoverGateId=null; hideLinkBanner(); setStatus('Linking cancelled'); scheduleDraw(); });
  function showLinkBanner(){ linkBanner.style.display='block'; }
  function hideLinkBanner(){ linkBanner.style.display='none'; }

  // State
  const ST = { shard:null, grid:null, previews: [], focus:{ x:-1, y:-1 }, baseline: null, panX: 0, panY: 0, currentBiome:'plains', rectPreview:null, draft:{ settlements:[], pois:[], tiles:{} }, linkSource:null, linkSourceId:null, hoverGateId:null };

  // Fetch JSON
  async function getJSON(url){ trace('fetch', url); const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

  // Grid helpers (derive strictly from tiles)
  const looks2D = (a)=>Array.isArray(a)&&a.length&&Array.isArray(a[0]);
  function ensureTilesFromAny(shard){
    if (!shard) return;
    const asTileObj = (cell,x,y)=>{
      if (cell && typeof cell==='object' && !Array.isArray(cell)){
        const b = (typeof cell.biome==='string') ? cell.biome : (typeof cell.tile==='string' ? cell.tile : 'bedrock');
        return { x, y, biome: b, elevation: Number.isFinite(cell.elevation)?cell.elevation:0, tags: Array.isArray(cell.tags)?cell.tags:[], resources: Array.isArray(cell.resources)?cell.resources:[], flags: Object.assign({ buildable:false, blocked:false, water:false, spawn:false }, cell.flags||{}) };
      }
      const b = (typeof cell==='string') ? cell : 'bedrock';
      return { x, y, biome: b, elevation:0, tags:[], resources:[], flags:{ buildable:false, blocked:false, water:false, spawn:false } };
    };
    if (looks2D(shard.tiles)){
      shard.tiles = shard.tiles.map((row,y)=> row.map((c,x)=> asTileObj(c,x,y)));
      return;
    }
    if (looks2D(shard.grid)){
      const H=shard.grid.length, W=shard.grid[0].length;
      shard.tiles = Array.from({length:H}, (_,y)=> Array.from({length:W},(_,x)=> asTileObj(shard.grid[y][x],x,y)));
      return;
    }
    shard.tiles = [];
  }
  function deriveGridFromTiles(shard){
    if (!shard || !looks2D(shard.tiles)) return [];
    const H=shard.tiles.length, W=shard.tiles[0].length;
    const out = new Array(H);
    for(let y=0;y<H;y++){ const row = shard.tiles[y], line=new Array(W); for(let x=0;x<W;x++){ const t=row[x]; const b=(t&&typeof t.biome==='string')?t.biome: (t&&typeof t.tile==='string'?t.tile:'plains'); line[x]=String(b).toLowerCase(); } out[y]=line; }
    return out;
  }

  // --- Shardgate helpers ---
  function allGates(){
    const arr=[];
    if(Array.isArray(ST.shard?.pois)) arr.push(...ST.shard.pois.filter(p=>p?.type==='shardgate'));
    if(Array.isArray(ST.draft?.pois)) arr.push(...ST.draft.pois.filter(p=>p?.type==='shardgate'));
    return arr;
  }
  function findGateById(id){ return allGates().find(g=>ensureGateId(g)===id)||null; }
  function findGateAt(x,y){
    const eq=(g)=>(((g?.x??g?.[0])|0)===x && ((g?.y??g?.[1])|0)===y);
    for(const p of allGates()){ if(eq(p)) return p; }
    return null;
  }
  function ensureGateId(g){
    if(!g) return '';
    if(!g.id){ const x=(g.x??g[0])|0, y=(g.y??g[1])|0; g.id=`gate_${x}_${y}`; }
    return String(g.id);
  }
  function getGateLinks(g){
    if(!g) return [];
    const arr = Array.isArray(g.linked_gates) ? g.linked_gates : g.meta?.linked_gates;
    if(Array.isArray(arr)) return arr;
    const single = g?.link || g?.meta?.link;
    return single ? [single] : [];
  }
  function setGateLinks(g,list){ if(!g) return; if('linked_gates' in g){ g.linked_gates=list; } else { g.meta=g.meta||{}; g.meta.linked_gates=list; } }
  function addGateLink(g,id){ const links=getGateLinks(g); if(!links.includes(id)){ setGateLinks(g, links.concat(id)); } }
  function getAllowReturn(g){ return g?.allow_return ?? g?.meta?.allow_return; }
  function setAllowReturn(g,val){ if(!g) return; if('allow_return' in g){ g.allow_return=val; } else { g.meta=g.meta||{}; g.meta.allow_return=val; } }
  function pruneOrphanLinks(){
    const all=allGates();
    const ids=new Set(all.map(g=>ensureGateId(g)));
    for(const g of all){
      const filtered=getGateLinks(g).filter(id=>ids.has(id) && id!==ensureGateId(g));
      setGateLinks(g, filtered);
    }
  }
  function openLinkEditor(g){
    if(!g) return;
    const dlg=document.createElement('div');
    Object.assign(dlg.style,{position:'fixed',top:'20%',left:'50%',transform:'translateX(-50%)',background:'#222',color:'#fff',padding:'10px',border:'1px solid #555',zIndex:1001});
    const form=document.createElement('div');
    const others=allGates().filter(gg=>gg!==g);
    const current=new Set(getGateLinks(g));
    for(const gg of others){ const id=ensureGateId(gg); const label=document.createElement('label'); const cb=document.createElement('input'); cb.type='checkbox'; cb.value=id; if(current.has(id)) cb.checked=true; label.appendChild(cb); label.appendChild(document.createTextNode(` ${gg.name||id} (${id})`)); form.appendChild(label); form.appendChild(document.createElement('br')); }
    const twoLbl=document.createElement('label'); const two=document.createElement('input'); two.type='checkbox'; twoLbl.appendChild(two); twoLbl.appendChild(document.createTextNode(' two-way')); form.appendChild(twoLbl); form.appendChild(document.createElement('br'));
    const btnSave=document.createElement('button'); btnSave.textContent='Save'; const btnCancel=document.createElement('button'); btnCancel.textContent='Cancel'; form.appendChild(btnSave); form.appendChild(btnCancel);
    dlg.appendChild(form); document.body.appendChild(dlg);
    btnCancel.addEventListener('click',()=>{ document.body.removeChild(dlg); });
    btnSave.addEventListener('click',()=>{ const selected=[...form.querySelectorAll('input[type=checkbox]')].filter(i=>i!==two&&i.checked).map(i=>i.value); setGateLinks(g,selected); const gId=ensureGateId(g); if(two.checked){ for(const gg of allGates()){ const id=ensureGateId(gg); if(id===gId) continue; const links=getGateLinks(gg); if(selected.includes(id)){ if(!links.includes(gId)) addGateLink(gg,gId); } else { setGateLinks(gg, links.filter(l=>l!==gId)); } } } pruneOrphanLinks(); markUnsaved(); scheduleDraw(); setStatus('Shardgate links updated'); document.body.removeChild(dlg); });
  }
  function canonicalizeGates(shard){
    if(!shard) return;
    const others = Array.isArray(shard.pois) ? shard.pois.filter(p=>p?.type!=='shardgate') : [];
    const gateSrc = [];
    if(Array.isArray(shard.pois)) gateSrc.push(...shard.pois.filter(p=>p?.type==='shardgate'));
    const layer = shard?.layers?.shardgates?.nodes; if(Array.isArray(layer)) gateSrc.push(...layer);
    const top = shard?.shardgates?.nodes; if(Array.isArray(top)) gateSrc.push(...top);
    const map=new Map();
    for(const g of gateSrc){ const x=(g.x??g[0])|0, y=(g.y??g[1])|0; const key=`${x},${y}`; if(map.has(key)) continue; const id=ensureGateId(g); map.set(key,{id,type:'shardgate',x,y,name:g.name||id,linked_gates:getGateLinks(g)}); }
    shard.pois=[...others, ...map.values()];
    if(shard?.layers?.shardgates) shard.layers.shardgates.nodes=[];
    if(shard?.shardgates) shard.shardgates.nodes=[];
  }

  // --- Settlement placement (draft) ---
  function rectWithin(x,y,w,h,maxW,maxH){ return x>=0&&y>=0&&(x+w)<=maxW&&(y+h)<=maxH; }
  function overlaps(x,y,w,h,arr){ return (arr||[]).some(r=> !(x+w<=r.x||r.x+r.w<=x||y+h<=r.y||r.y+r.h<=y)); }
  function canPlaceSettlementAt(x,y,tier){ const g=ST.grid; if(!g) return {ok:false,reason:'no grid'}; const H=g.length,W=g[0]?.length||0; const w=tier.size.w,h=tier.size.h; if(!rectWithin(x,y,w,h,W,H)) return {ok:false,reason:'Out of bounds'}; const existing=(Array.isArray(ST.shard?.settlements)?ST.shard.settlements:[]).map(s=>s.bounds||{}); const pending=(ST.draft?.settlements||[]).map(s=>s.bounds||{}); if(overlaps(x,y,w,h,[...existing,...pending])) return {ok:false,reason:'Overlaps existing'}; let allWater=true; for(let yy=y; yy<y+h; yy++){ for(let xx=x; xx<x+w; xx++){ const b=(ST.grid[yy][xx]||'').toLowerCase(); if (!['ocean','river','lake','reef','water'].includes(b)){ allWater=false; break; } } if(!allWater) break; } if(allWater) return {ok:false,reason:'Water only'}; return {ok:true}; }
  function previewSettlementAt(x,y,tier,ok){
    ST.previews = (ST.previews||[]).filter(p=>p.type!=='settlement');
    const pv={ type:'settlement', x, y, w:tier.size.w, h:tier.size.h, ok };
    ST.previews.push(pv);
    scheduleDraw();
    setTimeout(()=>{ ST.previews = ST.previews.filter(p=>p!==pv); scheduleDraw(); },1000);
  }
  function draftPlaceSettlementAt(x,y,tier){
    if(!ST.draft) ST.draft={settlements:[],pois:[],tiles:{}};
    if(!Array.isArray(ST.draft.settlements)) ST.draft.settlements=[];
    if(!ST.draft.tiles) ST.draft.tiles={};
    const id=`settle_${Date.now()}_${Math.floor(Math.random()*1e6)}`;
    const b={x,y,w:tier.size.w,h:tier.size.h};
    const sd={ id, name:`Tier ${tier.tier}`, tier:tier.tier, anchor:{x,y}, footprint:{w:b.w,h:b.h}, bounds:b, links:{roads:[],shardgates:[]}, discovered:false, meta:{} };
    ST.draft.settlements.push(sd);
    for(let yy=y; yy<y+b.h; yy++){
      for(let xx=x; xx<x+b.w; xx++){
        const k=`${xx},${yy}`;
        const prev=ST.draft.tiles[k]||{};
        const baseTags = ST.shard?.tiles?.[yy]?.[xx]?.tags || [];
        const prevTags = Array.isArray(prev.tags) ? prev.tags : [];
        ST.draft.tiles[k]={
          ...prev,
          settlementId:id,
          tags: Array.from(new Set([...baseTags, ...prevTags, 'settlement_area']))
        };
      }
    }
    scheduleDraw();
    setStatus(`Placed Tier ${tier.tier} at (${x},${y})`);
  }
  function applyDraftToShard(){
    if(!ST.shard) return;
    // Ensure container
    if (!Array.isArray(ST.shard.settlements)) ST.shard.settlements = [];
    // Merge settlements
    for(const s of (ST.draft?.settlements||[])) ST.shard.settlements.push(s);
    // Ensure POIs array and merge draft POIs (e.g., shardgate)
    if (!Array.isArray(ST.shard.pois)) ST.shard.pois = [];
    for (const p of (ST.draft?.pois||[])) ST.shard.pois.push(p);
    // Apply tile patches
    const tiles = ST.shard.tiles; if (Array.isArray(tiles)){
      for (const k of Object.keys(ST.draft?.tiles||{})){
        const [xs,ys] = k.split(','); const x=+xs, y=+ys; const patch = ST.draft.tiles[k];
        const t = tiles?.[y]?.[x]; if (!t) continue;
        if (patch.tags){ const set = new Set([...(t.tags||[]), ...patch.tags]); t.tags = Array.from(set); }
        if (patch.settlementId) t.settlementId = patch.settlementId;
      }
    }
    // Clear draft and redraw
    const sc = (ST.shard.settlements||[]).length;
    const pc = (ST.shard.pois||[]).length;
    ST.draft = { settlements:[], pois:[], tiles:{} };
    ST.grid = deriveGridFromTiles(ST.shard);
    scheduleDraw(); setStatus(`Draft applied: settlements=${sc}, pois=${pc}. Now Push Live to persist.`);
  }

  // Canvas sizing
  function ensureSizes(W,H){ const s=scale(); if(!W||!H) return; if(els.base.width!==W*s||els.base.height!==H*s){ els.base.width=W*s; els.base.height=H*s; els.base.style.width=`${W*s}px`; els.base.style.height=`${H*s}px`; }
    overlay.width=Math.max(2,Math.floor(W*s*dpr())); overlay.height=Math.max(2,Math.floor(H*s*dpr())); overlay.style.width=`${W*s}px`; overlay.style.height=`${H*s}px`; applyPan(); }

  function applyPan(){ const x = Math.round(ST.panX||0), y = Math.round(ST.panY||0); els.base.style.left = x+"px"; els.base.style.top = y+"px"; overlay.style.left = x+"px"; overlay.style.top = y+"px"; }

  function centerInFrame(){ const fw = els.frame?.clientWidth||0, fh = els.frame?.clientHeight||0; const cw = els.base?.width||0, ch = els.base?.height||0; ST.panX = Math.round((fw - cw)/2); ST.panY = Math.round((fh - ch)/2); applyPan(); }

  // Draw base biomes
  const BASE_COLORS={
    ocean:'#0b3a74', river:'#3B90B8', lake:'#2D7DA6', reef:'#1EA3A8',
    coast:'#d9c38c', beach:'#d9c38c',
    plains:'#91c36e', forest:'#2e7d32', savanna:'#C2B33C', shrubland:'#9A8F44', taiga:'#2D6248', jungle:'#1C6B46',
    hills:'#97b06b', mountains:'#8e3c3c', alpine:'#BFCADD', glacier:'#A7D3E9',
    tundra:'#b2c2c2', desert:'#e0c067', volcano:'#A14034', lavafield:'#5B2320',
    urban:'#555555', wetland:'#2E5D4E'
  };
  const PALETTES={ classic:BASE_COLORS, contrast:BASE_COLORS, pastel:BASE_COLORS, noir:BASE_COLORS };
  function biomeColor(id){ const pal=PALETTES[els.palette?.value||'classic']||PALETTES.classic; return pal[String(id).toLowerCase()]||'#889'; }

  function drawBase(){ const g=ST.grid; if(!g) return; const s=scale(); const ctx=els.base.getContext('2d'); ctx.clearRect(0,0,els.base.width,els.base.height); if(els.layerBiomes && !els.layerBiomes.checked){ return; } for(let y=0;y<g.length;y++){ const row=g[y]; for(let x=0;x<row.length;x++){ ctx.fillStyle=biomeColor(row[x]); ctx.fillRect(x*s,y*s,s,s); } } }

  // Draw overlay: grid + shardgates
  function drawOverlay(){ octx.clearRect(0,0,overlay.width,overlay.height); const g=ST.grid; if(!g) return; const s=scale(); const [H,W]=[g.length,g[0]?.length||0]; // grid
    // grid
    if(els.grid?.checked){ octx.save(); octx.globalAlpha=Math.min(1, alpha()+.2); octx.strokeStyle='#233042'; octx.lineWidth=1; octx.beginPath(); for(let x=0;x<=W;x++){ const px=x*s; octx.moveTo(px,0); octx.lineTo(px,H*s);} for(let y=0;y<=H;y++){ const py=y*s; octx.moveTo(0,py); octx.lineTo(W*s,py);} octx.stroke(); octx.restore(); }
    // infrastructure (roads)
    if(els.layerInfra?.checked){ const roads=ST.shard?.layers?.roads?.paths||[]; octx.save(); octx.globalAlpha=1; octx.strokeStyle='#a0a4ad'; octx.lineWidth=Math.max(1,Math.round(s*0.12)); octx.lineCap='round'; octx.lineJoin='round'; for(const path of roads){ if(!Array.isArray(path)||path.length<2) continue; octx.beginPath(); for(let i=0;i<path.length;i++){ const [x,y]=path[i]; const px=(x+0.5)*s, py=(y+0.5)*s; if(i===0) octx.moveTo(px,py); else octx.lineTo(px,py); } octx.stroke(); }
      // bridges (optional small markers)
      const bridges=ST.shard?.layers?.roads?.bridges||[]; octx.fillStyle='#cbd5e1'; for(const b of bridges){ const x=(b.x??b[0])|0,y=(b.y??b[1])|0; const px=(x+0.5)*s, py=(y+0.5)*s; const r=Math.max(2,Math.round(s*0.18)); octx.beginPath(); octx.arc(px,py,r,0,Math.PI*2); octx.fill(); }
      octx.restore(); }
    // shardgates from layers or pois

    if(els.layerShardgates?.checked){ const gates=(ST.shard?.layers?.shardgates?.nodes||[])
        .concat(ST.shard?.shardgates?.nodes||[])
        .concat((ST.shard?.pois||[]).filter(p=>p?.type==='shardgate'))
        .concat((ST.draft?.pois||[]).filter(p=>p?.type==='shardgate'));

      octx.save();
      const gateMap=new Map(); for(const g of gates){ if(g?.id) gateMap.set(String(g.id), g); }
      // links
      octx.globalAlpha=Math.max(.7,alpha()); octx.strokeStyle='#7b5cff'; octx.lineWidth=Math.max(1,Math.round(s*0.2));
      const drawn=new Set();
      for(const g of gates){
        const idA=String(g.id||'');
        for(const tid of getGateLinks(g)){
          const tgt=tid?gateMap.get(String(tid)):null; if(!tgt) continue;
          const idB=String(tid);
          const key=idA<idB?`${idA}|${idB}`:`${idB}|${idA}`;
          if(drawn.has(key)) continue; drawn.add(key);
          const x1=(g.x??g[0])|0, y1=(g.y??g[1])|0; const x2=(tgt.x??tgt[0])|0, y2=(tgt.y??tgt[1])|0;
          octx.beginPath(); octx.moveTo((x1+0.5)*s,(y1+0.5)*s); octx.lineTo((x2+0.5)*s,(y2+0.5)*s); octx.stroke();
        }
      }
      // gates
      octx.globalAlpha=Math.max(.9,alpha()); octx.fillStyle='#7b5cff'; octx.strokeStyle='#000'; octx.lineWidth=1;
      const srcId = ST.linkSourceId;
      const hovId = ST.hoverGateId;
      for(const g1 of gates){ const x=(g1.x??g1[0])|0, y=(g1.y??g1[1])|0; const id=ensureGateId(g1); const cx=(x+.5)*s, cy=(y+.5)*s, R=Math.max(3,Math.round(s*.36)); octx.beginPath(); octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy); octx.lineTo(cx,cy+R); octx.lineTo(cx-R,cy); octx.closePath(); octx.fill(); octx.stroke(); octx.beginPath(); octx.strokeStyle='rgba(255,255,255,.9)'; octx.arc(cx,cy,Math.max(2,Math.round(R*.55)),0,Math.PI*2); octx.stroke(); if(srcId&&id===srcId){ octx.beginPath(); octx.strokeStyle='#ffd60a'; octx.lineWidth=2; octx.arc(cx,cy,R+2,0,Math.PI*2); octx.stroke(); } else if(hovId&&id===hovId){ octx.beginPath(); octx.strokeStyle='#ffe66d'; octx.lineWidth=2; octx.arc(cx,cy,R+2,0,Math.PI*2); octx.stroke(); } const name=(g1.name||g1.id||'Gate'); drawLabel(cx, cy, name, true); }
      octx.restore(); }
    // settlements + POIs
    if(els.layerSettlements?.checked){ drawSettlementsAndPOIs(); }
    // Draft settlements overlay (always visible)
    drawDraftSettlements(s);
    // focus border
    if (ST.focus && ST.focus.x>=0 && ST.focus.y>=0){ const fx=ST.focus.x, fy=ST.focus.y; const fpx=fx*s, fpy=fy*s; octx.save(); octx.globalAlpha=1; octx.strokeStyle='rgba(255,214,10,0.95)'; octx.fillStyle='rgba(255,214,10,0.12)'; octx.lineWidth=2; octx.fillRect(fpx,fpy,s,s); octx.strokeRect(fpx+0.5,fpy+0.5,s-1,s-1); octx.restore(); }
    // rect preview
    if (ST.rectPreview){ const rp=ST.rectPreview; const rx=Math.min(rp.x0,rp.x1), ry=Math.min(rp.y0,rp.y1); const rw=Math.abs(rp.x1-rp.x0)+1, rh=Math.abs(rp.y1-rp.y0)+1; octx.save(); octx.globalAlpha=0.18; octx.fillStyle='#ffd60a'; octx.fillRect(rx*s, ry*s, rw*s, rh*s); octx.globalAlpha=0.95; octx.lineWidth=2; octx.strokeStyle='rgba(255,214,10,0.9)'; octx.strokeRect(rx*s+0.5, ry*s+0.5, rw*s-1, rh*s-1); octx.restore(); }
    // previews
    drawPreviews();
  }

  // --- Biome helpers (classification + editing) ---
  const WATER_SET = new Set(['ocean','lake','river','reef','sea','deep_ocean','deep-sea']);
  function normBiome(b){ return String(b||'').trim().toLowerCase().replace(/\s+/g,'_'); }
  function isWaterBiome(b){ return WATER_SET.has(normBiome(b)); }
  function setTileBiome(x,y, biome){
    if(!Array.isArray(ST.shard?.tiles)) return false; const H=ST.shard.tiles.length, W=ST.shard.tiles[0]?.length||0; if(x<0||y<0||y>=H||x>=W) return false;
    const b = normBiome(biome);
    const t = ST.shard.tiles[y][x] || { x, y, biome: b, elevation:0, tags:[], resources:[], flags:{ buildable:false, blocked:false, water:false, spawn:false } };
    t.biome = b; ST.shard.tiles[y][x] = t;
    ST.grid = deriveGridFromTiles(ST.shard);
    markUnsaved();
    scheduleDraw();
    return true;
  }
  function floodFillCategoryFrom(x0,y0, predicate, toBiome){
    if(!ST.grid) return 0; const H=ST.grid.length, W=ST.grid[0]?.length||0; if(x0<0||y0<0||y0>=H||x0>=W) return 0;
    const orig = ST.grid.map(r => r.slice());
    const k = (x,y)=>x+','+y; const seen = new Set(); const q=[[x0,y0]]; const to = normBiome(toBiome); const coords=[];
    const ok = (x,y)=> x>=0 && y>=0 && x<W && y<H && !seen.has(k(x,y)) && predicate(orig[y][x]);
    while(q.length){ const [x,y]=q.pop(); if(!ok(x,y)) continue; seen.add(k(x,y)); coords.push([x,y]); q.push([x+1,y]); q.push([x-1,y]); q.push([x,y+1]); q.push([x,y-1]); }
    for(const [x,y] of coords){ const t=ST.shard.tiles[y][x]; if(t) t.biome=to; }
    ST.grid = deriveGridFromTiles(ST.shard);
    markUnsaved();
    scheduleDraw();
    return coords.length;
  }

  function fillAll(toBiome){
    if(!ST.grid) return 0; const H=ST.grid.length, W=ST.grid[0]?.length||0; let n=0; for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ if (setTileBiome(x,y,toBiome)) n++; } } return n;
  }

function drawPreviews(){
    const s=scale();
    if(!ST.previews?.length) return;
    octx.save();
    for(const p of ST.previews){
      const x=p.x|0, y=p.y|0;
      const cx=(x+.5)*s, cy=(y+.5)*s;
      const R=Math.max(3,Math.round(s*.36));
      switch(p.type){
        case 'shardgate': {
          octx.globalAlpha=Math.max(.9,alpha());
          octx.fillStyle='#7b5cff';
          octx.strokeStyle='#000';
          octx.lineWidth=1;
          octx.beginPath();
          octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy); octx.lineTo(cx,cy+R); octx.lineTo(cx-R,cy);
          octx.closePath(); octx.fill(); octx.stroke();
          octx.beginPath();
          octx.strokeStyle='rgba(255,255,255,0.95)';
          octx.arc(cx,cy,Math.max(2,Math.round(R*.55)),0,Math.PI*2);
          octx.stroke();
          break;
        }
        case 'settlement': {
          const px=x*s, py=y*s, w=(p.w||1)*s, h=(p.h||1)*s;
          octx.globalAlpha=1;
          const good=p.ok!==false;
          octx.fillStyle=good?'rgba(34,197,94,0.35)':'rgba(239,68,68,0.35)';
          octx.strokeStyle=good?'#22c55e':'#ef4444';
          octx.lineWidth=2;
          octx.fillRect(px,py,w,h);
          octx.strokeRect(px+0.5,py+0.5,w-1,h-1);
          break;
        }
        case 'dungeon_entrance': {
          const r=Math.max(3,Math.round(s*.26));
          octx.globalAlpha=1;
          octx.fillStyle='#ff5252';
          octx.strokeStyle='#1b263b';
          octx.lineWidth=1;
          octx.beginPath();
          octx.moveTo(cx,cy-r); octx.lineTo(cx+r,cy+r); octx.lineTo(cx-r,cy+r);
          octx.closePath(); octx.fill(); octx.stroke();
          break;
        }
        case 'biome': {
          const px=x*s, py=y*s;
          octx.globalAlpha=1;
          octx.fillStyle='rgba(60,120,60,0.22)';
          octx.strokeStyle='rgba(60,120,60,0.85)';
          octx.lineWidth=1.5;
          octx.fillRect(px,py,s,s);
          octx.strokeRect(px+0.5,py+0.5,s-1,s-1);
          break;
        }
        case 'infrastructure':
        default: {
          const r=Math.max(2,Math.round(s*.28));
          octx.globalAlpha=1;
          octx.strokeStyle='#a0a4ad';
          octx.lineWidth=Math.max(1,Math.round(s*.12));
          octx.beginPath();
          octx.moveTo(cx-r,cy); octx.lineTo(cx+r,cy);
          octx.stroke();
        }
      }
      if (s>=12){
        octx.font=`${Math.max(10,Math.round(s*.5))}px system-ui`;
        octx.textAlign='center';
        octx.textBaseline='top';
        octx.strokeStyle='rgba(0,0,0,.65)';
        octx.lineWidth=3;
        const label=(p.type||'item').replace('_',' ');
        octx.strokeText(label,cx,cy+R+2);
        octx.fillStyle='#fff';
        octx.fillText(label,cx,cy+R+2);
      }
    }
    octx.restore();
  }

  function labelText(text){ return String(text||'').trim(); }
  function drawLabel(cx, cy, text, above=true){ const s=scale(); if(s<12) return; const t=labelText(text); if(!t) return; const y=cy+(above? -Math.max(8,Math.round(s*0.4)) : (Math.max(8,Math.round(s*0.4)))); octx.save(); octx.font=`${Math.max(10,Math.round(s*.5))}px system-ui, ui-sans-serif`; octx.textAlign='center'; octx.textBaseline='bottom'; octx.lineWidth=3; octx.strokeStyle='rgba(0,0,0,.65)'; octx.strokeText(t,cx,y); octx.fillStyle='#fff'; octx.fillText(t,cx,y); octx.restore(); }

  function drawSettlementsAndPOIs(){
    const s=scale();
    const setts = [];
    const L = ST.shard?.layers?.settlements || {};
    const pushList=(arr,type)=>{ if(Array.isArray(arr)) for(const it of arr){ const x=(it.x??it[0])|0,y=(it.y??it[1])|0; setts.push({x,y,type}); } };
    pushList(L.cities,'city'); pushList(L.towns,'town'); pushList(L.villages,'village'); pushList(L.ports,'port');
    // Also include settlement-like POIs
    const poiList = Array.isArray(ST.shard?.pois) ? ST.shard.pois : [];
    const isSettlementType=(t)=>['city','town','village','port','settlement','hamlet'].includes(String(t||'').toLowerCase());
    const otherPois = [];
    for (const p of poiList){ const t=String(p?.type||''); const x=(p.x??p[0])|0,y=(p.y??p[1])|0; if(isSettlementType(t)){ setts.push({x,y,type:t.toLowerCase()}); } else { otherPois.push({x,y,type:t.toLowerCase()}); } }
    // de-dupe by x,y,type
    const key=({x,y,type})=>`${x},${y},${type}`; const seen=new Set(); const uniq=(list)=>{ const out=[]; for(const it of list){ const k=key(it); if(seen.has(k)) continue; seen.add(k); out.push(it); } return out; };
    const A = uniq(setts);
    const B = uniq(otherPois);
    // draw settlements
    octx.save();
    // build name lookup from pois/sites
    const nameByXY = new Map();
    const addName=(arr)=>{ if(Array.isArray(arr)) for(const it of arr){ const x=(it.x??it[0])|0, y=(it.y??it[1])|0; const n=it.name||it.id||it.type; nameByXY.set(`${x},${y}`, String(n||'')); } };
    addName(ST.shard?.pois); addName(ST.shard?.sites);
    for(const p of A){ const cx=(p.x+.5)*s, cy=(p.y+.5)*s; let r, fill, stroke='#1b263b';
      switch(p.type){ case 'city': r=Math.max(4,Math.round(s*.32)); fill='#2e7d32'; break; case 'town': r=Math.max(3,Math.round(s*.26)); fill='#4caf50'; break; case 'village': r=Math.max(2,Math.round(s*.22)); fill='#81c784'; break; case 'port': r=Math.max(3,Math.round(s*.26)); fill='#2c7da0'; break; default: r=Math.max(2,Math.round(s*.22)); fill='#4caf50'; }
      octx.globalAlpha=1; octx.fillStyle=fill; octx.strokeStyle=stroke; octx.lineWidth=1; octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fill(); octx.stroke();
      const nm = nameByXY.get(`${p.x},${p.y}`) || p.type;
      drawLabel(cx, cy, nm, true);
    }
    // draw other POIs (non-settlement)
    for(const p of B){ const cx=(p.x+.5)*s, cy=(p.y+.5)*s; const R=Math.max(3,Math.round(s*.26));
      const t=p.type;
      octx.globalAlpha=1; octx.lineWidth=1; octx.strokeStyle='#1b263b';
      if(t==='dungeon' || t==='dungeon_entrance'){ octx.fillStyle='#ff5252'; octx.beginPath(); octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy+R); octx.lineTo(cx-R,cy+R); octx.closePath(); octx.fill(); octx.stroke(); drawLabel(cx, cy, 'Dungeon', false); }
      else if(t==='ruin' || t==='tower' || t==='temple'){ octx.fillStyle='#9c27b0'; octx.beginPath(); octx.rect(cx-R*0.8, cy-R*0.8, R*1.6, R*1.6); octx.fill(); octx.stroke(); }
      else if(t==='camp' || t==='encampment'){ octx.fillStyle='#ff9800'; octx.beginPath(); octx.arc(cx,cy,Math.max(2,Math.round(s*.2)),0,Math.PI*2); octx.fill(); octx.stroke(); }
      else { // generic diamond
        octx.fillStyle='#607d8b'; octx.beginPath(); octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy); octx.lineTo(cx,cy+R); octx.lineTo(cx-R,cy); octx.closePath(); octx.fill(); octx.stroke(); const label=t? (t.charAt(0).toUpperCase()+t.slice(1).replace('_',' ')) : ''; drawLabel(cx, cy, label, false);
      }
    }
    octx.restore();
    // Draft POIs overlay (purple outline)
    const dpois = Array.isArray(ST.draft?.pois) ? ST.draft.pois : [];
    if (dpois.length){ const t=scale(); octx.save(); for(const p of dpois){ const cx=(p.x+.5)*t, cy=(p.y+.5)*t; const R=Math.max(3,Math.round(t*.26)); octx.globalAlpha=1; octx.lineWidth=2; octx.strokeStyle='#a855f7'; octx.beginPath(); octx.arc(cx,cy,Math.max(2,Math.round(R*.8)),0,Math.PI*2); octx.stroke(); const label=(p.type||'poi').replace('_',' '); drawLabel(cx, cy, `draft ${label}`, false); } octx.restore(); }
    // persisted rectangles (top-level settlements)
    const pers = Array.isArray(ST.shard?.settlements) ? ST.shard.settlements : [];
    if (pers.length){ const t=scale(); octx.save(); for(const s1 of pers){ const b=s1.bounds||{}; const sx=b.x*t, sy=b.y*t, sw=b.w*t, sh=b.h*t; octx.globalAlpha=0.18; octx.fillStyle='#22c55e'; octx.fillRect(sx,sy,sw,sh); octx.globalAlpha=1; octx.strokeStyle='#16a34a'; octx.lineWidth=2; octx.strokeRect(sx+0.5,sy+0.5,sw-1,sh-1); const label=((s1.tier||'').toString())+(s1.name?` ${s1.name}`:''); drawLabel(sx+sw/2, sy, label, true);} octx.restore(); }
  }

  function drawDraftSettlements(tileSize){ const list = Array.isArray(ST.draft?.settlements)? ST.draft.settlements : []; if(!list.length) return; octx.save(); for(const s1 of list){ const b=s1.bounds||{}; const sx=b.x*tileSize, sy=b.y*tileSize, sw=b.w*tileSize, sh=b.h*tileSize; octx.globalAlpha=0.22; octx.fillStyle='#fbbf24'; octx.fillRect(sx,sy,sw,sh); octx.globalAlpha=1; octx.strokeStyle='#f59e0b'; octx.lineWidth=2; octx.strokeRect(sx+0.5,sy+0.5,sw-1,sh-1); } octx.restore(); }

  // --- Tile Info Panel ---
  function rawTileAt(x,y){
    const t = ST.shard?.tiles?.[y]?.[x];
    if (t && typeof t === 'object' && !Array.isArray(t)) return JSON.parse(JSON.stringify(t));
    if (t && typeof t === 'string') return { x, y, biome: String(t) };
    if (t && typeof t === 'object' && typeof t.tile === 'string') return Object.assign({ x, y }, JSON.parse(JSON.stringify(t)));
    const g = ST.grid?.[y]?.[x];
    return { x, y, biome: typeof g==='string'? g : 'unknown' };
  }
  function contextAt(x,y){
    const L = ST.shard?.layers || {};
    const gates = (L.shardgates?.nodes||[]).filter(n=> ((n.x??n[0])|0)===x && ((n.y??n[1])|0)===y);
    const poi = (ST.shard?.pois||[]).filter(n=> ((n.x??n[0])|0)===x && ((n.y??n[1])|0)===y);
    const SS=L.settlements||{}; const pick=(arr)=> (Array.isArray(arr)?arr:[]).filter(n=> ((n.x??n[0])|0)===x && ((n.y??n[1])|0)===y);
    const settlements={ cities: pick(SS.cities), towns: pick(SS.towns), villages: pick(SS.villages), ports: pick(SS.ports) };
    return {
      gridBiome: ST.grid?.[y]?.[x] || null,
      tile: ST.shard?.tiles?.[y]?.[x] ?? null,
      gates, poi, settlements
    };
  }
  function updateTilePanel(x,y){
    if (els.tileCoord) els.tileCoord.value = `${x},${y}`;
    if (els.tileJson) els.tileJson.value = JSON.stringify(rawTileAt(x,y), null, 2);
    if (els.tileContext) els.tileContext.textContent = JSON.stringify(contextAt(x,y), null, 2);
    if (els.btnTileApply) els.btnTileApply.disabled = false;
    if (els.btnTileValidate) els.btnTileValidate.disabled = false;
  }

  // --- Remove helpers ---
  function resetBiomeAt(x,y){
    if(!ST.baseline || !Array.isArray(ST.baseline.tiles)) return 0;
    const bt=ST.baseline.tiles?.[y]?.[x];

    const current=ST.shard?.tiles?.[y]?.[x];
    const bb=bt? normBiome(bt.biome) : null;
    const cb=current? normBiome(current.biome) : null;
    if(!bb || !cb || bb===cb) return 0;
    setTileBiome(x,y,bb);
    return 1;
  }

  function removeDraftAt(x,y){
    let removed=false;
    const key=`${x},${y}`;
    if(ST.draft?.tiles && ST.draft.tiles[key]){ delete ST.draft.tiles[key]; removed=true; }
    if(Array.isArray(ST.draft?.pois)){
      const before=ST.draft.pois.length;
      ST.draft.pois=ST.draft.pois.filter(p=>!(p.x===x && p.y===y));
      if(ST.draft.pois.length!==before) removed=true;
    }
    if(Array.isArray(ST.draft?.settlements)){
      const before=ST.draft.settlements.length;
      ST.draft.settlements=ST.draft.settlements.filter(s=>{
        const b=s.bounds||{};
        const hit=x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h;
        if(hit){
          for(let yy=b.y; yy<b.y+b.h; yy++){ for(let xx=b.x; xx<b.x+b.w; xx++){ delete ST.draft.tiles[`${xx},${yy}`]; } }
        }
        return !hit;
      });
      if(ST.draft.settlements.length!==before) removed=true;
    }
    if(removed){ markUnsaved(); scheduleDraw(); }
    return removed;
  }

  // Load list

  async function loadShard(path,label){ try{ setDebug(`GET ${path}`); const shard=await getJSON(path); if(!shard) throw new Error('invalid JSON'); const lbl=label || shard?.meta?.displayName || path; setStatus(`Loaded: ${lbl}`); setDebug(`loaded ${path}`); ST.baseline=clone(shard); ensureTilesFromAny(ST.baseline); ST.previews=[]; ST.focus={x:-1,y:-1}; renderAll(shard); }catch(e){ setStatus(`Failed to load shard: ${e.message}`); setDebug(`error ${e.message} · ${path}`); trace('loadShard:error', e?.message||e); }}
  async function loadSelectedShard(){ const opt=els.select?.selectedOptions?.[0]; if(!opt){ trace('loadSelectedShard:no-selection'); return; } const path=opt.getAttribute('data-path')||`/static/public/shards/${opt.value}`; await loadShard(path,opt.textContent); }

  function renderAll(shard){ if(!shard){ return; } trace('renderAll:start'); ST.shard=shard; canonicalizeGates(ST.shard); ensureTilesFromAny(ST.shard); ST.grid=deriveGridFromTiles(ST.shard); const H=ST.grid.length, W=H?ST.grid[0].length:0; ensureSizes(W,H); centerInFrame(); drawBase(); drawOverlay(); trace('renderAll:complete', {W,H}); }

  // Event wiring
  els.loadBtn?.addEventListener('click', (e)=>{ e?.preventDefault?.(); loadSelectedShard(); });
  els.select?.addEventListener('change', ()=> loadSelectedShard());
  els.scale?.addEventListener('input', ()=> { if(!ST.grid) return; ensureSizes(ST.grid[0]?.length||0, ST.grid.length||0); scheduleDraw(); });
  els.grid?.addEventListener('change', ()=> scheduleDraw());
  els.opacity?.addEventListener('input', ()=> scheduleDraw());
  els.layerBiomes?.addEventListener('change', ()=> { scheduleDraw(); });
  els.layerInfra?.addEventListener('change', ()=> scheduleDraw());
  els.layerSettlements?.addEventListener('change', ()=> scheduleDraw());
  els.layerShardgates?.addEventListener('change', ()=> scheduleDraw());
  els.palette?.addEventListener('change', ()=> scheduleDraw());

  // Zoom and pan controls
  function setScalePx(px){ px=Math.max(4, Math.min(64, Math.round(px))); if(els.scale){ els.scale.value=String(px); } if(ST.grid){ ensureSizes(ST.grid[0]?.length||0, ST.grid.length||0); scheduleDraw(); } }
  function zoomAt(fx, fy, factor){ const s1=scale(); const s2=Math.max(4, Math.min(64, Math.round(s1*factor))); if(s2===s1) return; const k=s2/s1; const panX=ST.panX||0, panY=ST.panY||0; ST.panX = Math.round(fx - (fx - panX)*k); ST.panY = Math.round(fy - (fy - panY)*k); setScalePx(s2); applyPan(); }
  els.frame?.addEventListener('wheel', (e)=>{ e?.preventDefault?.(); const fx=e.clientX - (els.frame.getBoundingClientRect().left); const fy=e.clientY - (els.frame.getBoundingClientRect().top); const factor = (e.deltaY>0)? 0.9 : 1.1; zoomAt(fx, fy, factor); }, { passive:false });
  let dragging=false, dragStartX=0, dragStartY=0, startPanX=0, startPanY=0;
  function tileAtClient(e){ const rect=els.base.getBoundingClientRect(); const s=scale(); const x=Math.floor((e.clientX-rect.left)/s), y=Math.floor((e.clientY-rect.top)/s); return {x,y}; }
  let brushing=false, recting=false, rectStart=null;
  els.frame?.addEventListener('mousedown', (e)=>{
    if(e.button!==0) return;
    const {x,y}=tileAtClient(e);
    if (e.shiftKey){ recting=true; rectStart={x,y}; ST.rectPreview={x0:x,y0:y,x1:x,y1:y}; scheduleDraw(); return; }
    if (e.ctrlKey){ brushing=true; setTileBiome(x,y, ST.currentBiome||'plains'); return; }
    dragging=true; dragStartX=e.clientX; dragStartY=e.clientY; startPanX=ST.panX||0; startPanY=ST.panY||0; els.frame.style.cursor='grabbing';
  });
  window.addEventListener('mousemove', (e)=>{
    if(ST.linkSource){ const {x,y}=tileAtClient(e); const t=findGateAt(x,y); const id=t?ensureGateId(t):null; if(id!==ST.hoverGateId){ ST.hoverGateId=id; scheduleDraw(); } return; }
    if (recting){ const {x,y}=tileAtClient(e); if(!ST.grid) return; ST.rectPreview={x0:rectStart.x,y0:rectStart.y,x1:x,y1:y}; scheduleDraw(); return; }
    if (brushing){ const {x,y}=tileAtClient(e); setTileBiome(x,y, ST.currentBiome||'plains'); return; }
    if(!dragging) return; const dx=e.clientX-dragStartX, dy=e.clientY-dragStartY; ST.panX=startPanX+dx; ST.panY=startPanY+dy; applyPan();
  });
  window.addEventListener('mouseup', (e)=>{
    if(ST.linkSource){ let linked=false; if(e.button===0 && els.frame.contains(e.target)){ const {x,y}=tileAtClient(e); const target=findGateAt(x,y); if(target && ensureGateId(target)!==ST.linkSourceId){ const idA=ST.linkSourceId; const idB=ensureGateId(target); const src=findGateById(idA); addGateLink(src,idB); addGateLink(target,idA); setAllowReturn(src,1); setAllowReturn(target,1); setStatus(`Linked ${idA} ↔ ${idB}`); markUnsaved(); scheduleDraw(); linked=true; } }
      if(!linked) setStatus('Linking cancelled'); ST.linkSource=null; ST.linkSourceId=null; ST.hoverGateId=null; hideLinkBanner(); return; }
    if (recting){ const {x,y}=tileAtClient(e); const x0=Math.min(rectStart.x,x), y0=Math.min(rectStart.y,y), x1=Math.max(rectStart.x,x), y1=Math.max(rectStart.y,y); for(let yy=y0; yy<=y1; yy++){ for(let xx=x0; xx<=x1; xx++){ setTileBiome(xx,yy, ST.currentBiome||'plains'); } } recting=false; ST.rectPreview=null; scheduleDraw(); return; }
    if (brushing){ brushing=false; return; }
    if(dragging){ const moved=Math.abs((e?.clientX||0)-dragStartX)+Math.abs((e?.clientY||0)-dragStartY); dragging=false; els.frame.style.cursor='default'; if (moved<4){ const {x,y}=tileAtClient(e); if(x>=0&&y>=0&&ST.grid&&y<ST.grid.length&&x<ST.grid[0].length){ ST.focus={x,y}; scheduleDraw(); updateTilePanel(x,y); } } }
  });
  window.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && ST.linkSource){ ST.linkSource=null; ST.linkSourceId=null; ST.hoverGateId=null; hideLinkBanner(); setStatus('Linking cancelled'); scheduleDraw(); } });
  $('btnZoomIn')?.addEventListener('click', (e)=>{ e?.preventDefault?.(); const rect=els.frame.getBoundingClientRect(); zoomAt(rect.width/2, rect.height/2, 1.2); });
  $('btnZoomOut')?.addEventListener('click', (e)=>{ e?.preventDefault?.(); const rect=els.frame.getBoundingClientRect(); zoomAt(rect.width/2, rect.height/2, 0.8); });
  $('btnFit')?.addEventListener('click', (e)=>{ e?.preventDefault?.(); centerInFrame(); });
  // Undo to last baseline + Save draft
  $('btnUndoToSave')?.addEventListener('click', (e)=>{ e?.preventDefault?.(); revertToBaseline2(); });
  $('btnSaveDraft')?.addEventListener('click', async (e)=>{ e?.preventDefault?.();
    // Apply current draft to shard, validate, then save local snapshot and enable Push
    try {
      applyDraftToShard();
      const mod = await import('/static/src/shardViewer/schema.js');
      const canon = mod.migrateToCanonicalShard(ST.shard);
      const res = mod.validateShard(canon);
      if (!res.ok){ setStatus('Save Draft failed: schema issues'); setDebug(String((res.errors||[]).join(', '))); markUnsaved(); return; }
      saveDraft2();
      markReadyToPush();
    } catch(err){ setStatus('Save Draft failed'); setDebug(String(err?.message||err)); markUnsaved(); }
  });
  // Save All (apply draft) and Clear Draft
  // Removed standalone Save All / Clear Draft (now part of Save Draft flow)
  // Clear log
  $('btnClearLog')?.addEventListener('click', (e)=>{ e?.preventDefault?.(); const el=$('actionLog'); if(el) el.textContent=''; setStatus('Log cleared'); });

  // Context menu for placement
  const ctx = createContextMenuV2({ onSelect: onPlaceSelect });
  els.frame?.addEventListener('contextmenu', (e)=>{
    if(!ST.grid) return; e?.preventDefault?.(); const rect=els.base.getBoundingClientRect(); const s=scale(); const x=Math.floor((e.clientX-rect.left)/s), y=Math.floor((e.clientY-rect.top)/s); if(x<0||y<0||y>=ST.grid.length||x>=ST.grid[0].length) return; ST.focus={x,y}; scheduleDraw(); ctx.open({ tile:{x,y}, screen:{ left:e.clientX, top:e.clientY } });
  });

  function onPlaceSelect(sel){ const detail={ shard_id: ST.shard?.shard_id || ST.shard?.meta?.name || 'unknown', tile:{ x: sel.tile.x, y: sel.tile.y }, place:{ type: sel.type, defaults: sel.defaults||{} }, source:'contextMenu' }; document.dispatchEvent(new CustomEvent('editor:placeRequested', { detail })); ST.previews.push({ x: sel.tile.x, y: sel.tile.y, type: sel.type, defaults: sel.defaults||{} }); scheduleDraw(); }
  // Intercept POI placements to queue into draft
  document.addEventListener('editor:placeRequested', (e)=>{
    const d = e?.detail; if(!d) return; const { tile, place } = d; const x = tile?.x|0, y = tile?.y|0; const t = String(place?.type||'');
    if (t === 'shardgate' || t === 'dungeon_entrance' || t === 'poi') {
      const id = `poi_${t}_${Date.now()}_${Math.floor(Math.random()*1e5)}`;
      const name = place?.defaults?.name || (t==='shardgate'?'Shardgate': (t==='dungeon_entrance'?'Dungeon Entrance':'POI'));
      if (!Array.isArray(ST.draft.pois)) ST.draft.pois = [];
      ST.draft.pois.push({ id, type: t, x, y, name, icon: t, description:'', meta:{} });
      setStatus(`Drafted ${t.replace('_',' ')} at (${x},${y}). Click Save All to apply.`);
      markUnsaved();
      scheduleDraw();
    }
  });

  function createContextMenuV2({ onSelect }){
    const root=document.createElement('div'); root.className='ctx-menu'; root.style.display='none'; document.body.appendChild(root);
    let active=false, submenu=null, submenu2=null, submenu3=null, items=[], focusIdx=0, current={x:0,y:0};
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)); const focus=(i)=>{ focusIdx=clamp(i,0,items.length-1); items[focusIdx]?.focus?.(); };
    const removeSub=()=>{ submenu?.remove?.(); submenu=null; removeSub2(); };
    const removeSub2=()=>{ submenu2?.remove?.(); submenu2=null; removeSub3(); };
    const removeSub3=()=>{ submenu3?.remove?.(); submenu3=null; };
    function openBiomeCascade(anchorButton){
      removeSub2(); submenu2=document.createElement('div'); submenu2.className='ctx-submenu'; document.body.appendChild(submenu2);
      const lvl2=[['Land','land'],['Ocean','ocean']];
      for(const [lbl,kind] of lvl2){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent=lbl; b.addEventListener('mouseenter',()=>openBiomeList(kind)); b.addEventListener('click',()=>openBiomeList(kind)); submenu2.appendChild(b); }
      const ab = anchorButton.getBoundingClientRect(); const sbw=220, sbh=lvl2.length*30+12; const left=(ab.right+sbw<innerWidth)?ab.right:Math.max(0,ab.left-sbw); const top=(ab.top+sbh<innerHeight)?ab.top:Math.max(0,innerHeight-sbh); submenu2.style.left=left+'px'; submenu2.style.top=top+'px';
    }
    function openBiomeList(kind){
      removeSub3(); submenu3=document.createElement('div'); submenu3.className='ctx-submenu'; document.body.appendChild(submenu3);
      const LAND_BIOMES=['plains','forest','hills','mountains','tundra','desert','savanna','shrubland','taiga','jungle','alpine','glacier','volcano','lavafield','urban','wetland','coast','beach'];
      const OCEAN_BIOMES=['ocean','reef','river','lake'];
      const list = kind==='ocean' ? OCEAN_BIOMES : LAND_BIOMES;
      for(const key of list){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent=key.replace(/_/g,' ');
        b.addEventListener('click',()=>{
          const {x,y}=current; const start=ST.grid?.[y]?.[x]; if(!start){ setStatus('No grid loaded'); close(); return; }
          if (kind==='land'){
            ST.currentBiome = key;
            if (isWaterBiome(start)) setTileBiome(x,y,'plains');
            const n=floodFillCategoryFrom(x,y,(b)=>!isWaterBiome(b), key);
            setStatus(n?`Filled ${n} land tile(s) as ${key}`:`No land region filled`);
            scheduleDraw(); close();
          } else {
            ST.currentBiome = key;
            if (!isWaterBiome(start)) { setStatus('Pick an ocean tile to fill'); setTileBiome(x,y,key); scheduleDraw(); close(); return; }
            const n=floodFillCategoryFrom(x,y,(b)=>isWaterBiome(b), key);
            setStatus(n?`Filled ${n} ocean tile(s) as ${key}`:`No ocean region filled`);
            scheduleDraw(); close();
          }
        });
        submenu3.appendChild(b);
      }
      const rb=submenu2.getBoundingClientRect(); const sbw=220, sbh=list.length*30+12; const left=(rb.right+sbw<innerWidth)?rb.right:Math.max(0,rb.left-sbw); const top=(rb.top+sbh<innerHeight)?rb.top:Math.max(0,innerHeight-sbh); submenu3.style.left=left+'px'; submenu3.style.top=top+'px';
    }
    const openBgMenu=(anchor)=>{ removeSub3(); const bg=document.createElement('div'); bg.className='ctx-submenu'; document.body.appendChild(bg); const options=[['Fill All: Bedrock','bedrock'],['Fill All: Ocean','ocean'],['Fill All: Plains','plains']]; for(const [lbl,val] of options){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent=lbl; b.addEventListener('click',()=>{ const n=fillAll(val); setStatus(`Filled ${n} tiles as ${val}`); scheduleDraw(); close(); }); bg.appendChild(b);} const ab=anchor.getBoundingClientRect(); const sbw=240, sbh=options.length*30+12; const left=(ab.right+sbw<innerWidth)?ab.right:Math.max(0,ab.left-sbw); const top=(ab.top+sbh<innerHeight)?ab.top:Math.max(0,innerHeight-sbh); bg.style.left=left+'px'; bg.style.top=top+'px'; submenu3=bg; };
    const openSub=()=>{ removeSub(); submenu=document.createElement('div'); submenu.className='ctx-submenu'; document.body.appendChild(submenu); const entries=[['Shardgate','shardgate'],['Settlement ▶','settlement'],['Dungeon Entrance','dungeon_entrance'],['Place Land Tile','land_tile'],['Biome','biome'],['Background','background'],['Infrastructure','infrastructure']]; for(const [lbl,t] of entries){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent=lbl; if(t==='biome'){ b.addEventListener('mouseenter',()=>openBiomeCascade(b)); b.addEventListener('click',()=>openBiomeCascade(b)); } else if (t==='background'){ b.addEventListener('mouseenter',()=>openBgMenu(b)); b.addEventListener('click',()=>openBgMenu(b)); } else if (t==='settlement'){ const openSettle=()=>{ removeSub3(); submenu3=document.createElement('div'); submenu3.className='ctx-submenu'; document.body.appendChild(submenu3); const tiers=[{tier:1,label:'Tier 1',size:{w:1,h:1}},{tier:2,label:'Tier 2',size:{w:1,h:1}},{tier:3,label:'Tier 3',size:{w:2,h:2}},{tier:4,label:'Tier 4',size:{w:2,h:2}},{tier:5,label:'Tier 5',size:{w:4,h:4}}]; for(const tt of tiers){ const bb=document.createElement('button'); bb.className='ctx-item'; bb.textContent=tt.label; bb.addEventListener('click',()=>{ const chk=canPlaceSettlementAt(current.x,current.y,tt); previewSettlementAt(current.x,current.y,tt,chk.ok); setStatus(`Tier ${tt.tier} ${chk.ok?'preview':'invalid: '+chk.reason}`); if(!chk.ok){ close(); return; } draftPlaceSettlementAt(current.x,current.y,tt); close(); }); submenu3.appendChild(bb);} const rb=submenu.getBoundingClientRect(); const sbw=220, sbh=tiers.length*30+12; const left=(rb.right+sbw<innerWidth)?rb.right:Math.max(0,rb.left-sbw); const top=(rb.top+sbh<innerHeight)?rb.top:Math.max(0,innerHeight-sbh); submenu3.style.left=left+'px'; submenu3.style.top=top+'px'; }; b.addEventListener('mouseenter',openSettle); b.addEventListener('click',openSettle); } else if (t==='land_tile'){ b.addEventListener('click',()=>{ const n=setTileBiome(current.x,current.y,'plains'); setStatus(n?'Placed land tile (plains)':'Failed to place'); scheduleDraw(); close(); }); } else { b.addEventListener('click',()=>emit(t)); } submenu.appendChild(b);} const rb=root.getBoundingClientRect(); const sbw=220,sbh=entries.length*30+12; const left=(rb.right+sbw<innerWidth)?rb.right:Math.max(0,rb.left-sbw); const top=(rb.top+sbh<innerHeight)?rb.top:Math.max(0,innerHeight-sbh); submenu.style.left=left+'px'; submenu.style.top=top+'px'; };
    const build=(screen)=>{ root.innerHTML='';
      const m=document.createElement('button'); m.textContent='Place …'; m.className='ctx-item'; m.setAttribute('aria-haspopup','true');
      const sep=document.createElement('div'); sep.className='ctx-sep';
      const list=[];
      // Remove group
      const flags=hasAt(ST,current.x,current.y,normBiome);
      const dk=`${current.x},${current.y}`;
      const hasDraft=(ST.draft?.tiles&&ST.draft.tiles[dk]) || (ST.draft?.pois||[]).some(p=>p.x===current.x&&p.y===current.y) || (ST.draft?.settlements||[]).some(s=>{const b=s.bounds||{};return current.x>=b.x&&current.x<b.x+b.w&&current.y>=b.y&&current.y<b.y+b.h;});
      if (flags.any||hasDraft){
        const rmh=document.createElement('div'); rmh.className='ctx-item'; rmh.style.fontWeight='600'; rmh.textContent='Remove at tile'; rmh.tabIndex=-1; rmh.style.cursor='default';
        root.appendChild(rmh);
        if(flags.settlement){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent='Remove Settlements'; b.addEventListener('click',()=>{ const n=removeAt(ST,current.x,current.y,'settlement'); setStatus(n?`Removed ${n} settlement(s)`: 'No settlements here'); scheduleDraw(); markUnsaved(); close(); }); root.appendChild(b); list.push(b); }
        if(flags.poi){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent='Remove POIs'; b.addEventListener('click',()=>{ const n=removeAt(ST,current.x,current.y,'poi'); setStatus(n?`Removed ${n} POI(s)`: 'No POIs here'); scheduleDraw(); markUnsaved(); close(); }); root.appendChild(b); list.push(b); }
        if(flags.shardgate){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent='Remove Shardgates'; b.addEventListener('click',()=>{ const n=removeAt(ST,current.x,current.y,'shardgate'); pruneOrphanLinks(); setStatus(n?`Removed ${n} shardgate(s)`: 'No shardgates here'); scheduleDraw(); markUnsaved(); close(); }); root.appendChild(b); list.push(b);
          const bEdit=document.createElement('button'); bEdit.className='ctx-item'; bEdit.textContent='Edit Shardgate Links'; bEdit.addEventListener('click',()=>{ const g=findGateAt(current.x,current.y); if(!g){ setStatus('No shardgate here'); close(); return; } openLinkEditor(g); close(); }); root.appendChild(bEdit); list.push(bEdit);

          const b2=document.createElement('button'); b2.className='ctx-item'; b2.textContent=ST.linkSource?'Select Link Target':'Link to Shardgate'; b2.addEventListener('click',()=>{ const g=findGateAt(current.x,current.y); if(ST.linkSource){ ST.linkSource=null; ST.linkSourceId=null; ST.hoverGateId=null; hideLinkBanner(); setStatus('Linking cancelled'); } else if(g){ ST.linkSource=g; ST.linkSourceId=ensureGateId(g); ST.hoverGateId=null; showLinkBanner(); setStatus('Select destination shardgate'); } else { setStatus('No shardgate here'); } close(); }); root.appendChild(b2); list.push(b2); }

        if(flags.biome){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent='Remove Biome (reset to baseline)'; b.addEventListener('click',()=>{ const n=resetBiomeAt(current.x,current.y); setStatus(n?'Biome reset to baseline':'Biome already baseline'); scheduleDraw(); markUnsaved(); close(); }); root.appendChild(b); list.push(b); }
        if(hasDraft){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent='Remove Draft Markers'; b.addEventListener('click',()=>{ const removed=removeDraftAt(current.x,current.y); setStatus(removed?'Draft markers removed':'No draft markers'); close(); }); root.appendChild(b); list.push(b); }
        root.appendChild(sep.cloneNode());
      }
      const c=document.createElement('button'); c.textContent='Cancel'; c.className='ctx-item';
      root.appendChild(m); list.push(m);
      root.appendChild(sep);
      root.appendChild(c); list.push(c);
      items=list.filter(Boolean);
      focus(0);
      m.addEventListener('mouseenter',openSub); m.addEventListener('click',openSub); c.addEventListener('click',close);
      root.onkeydown=(e)=>{ if(e.key==='Escape'){e?.preventDefault?.();close();} else if(e.key==='ArrowDown'){e?.preventDefault?.();focus(focusIdx+1);} else if(e.key==='ArrowUp'){e?.preventDefault?.();focus(focusIdx-1);} else if(e.key==='ArrowRight'){e?.preventDefault?.();openSub(); submenu?.querySelector('button')?.focus();} else if(e.key==='ArrowLeft'){e?.preventDefault?.(); removeSub(); } else if(e.key==='Enter'){e?.preventDefault?.(); items[focusIdx]?.click?.(); } };
      const w=200,h=120; const left=(screen.left+w<innerWidth)?screen.left:Math.max(0,screen.left-w); const top=(screen.top+h<innerHeight)?screen.top:Math.max(0,screen.top-h); root.style.left=left+'px'; root.style.top=top+'px'; };
    function emit(type){ onSelect?.({ type, tile: current, defaults: defaultsFor(type) }); close(); }
    const defaultsFor=(t)=> t==='shardgate'?{name:'New Shardgate',meta:{target_shard_id:'',target_x:null,target_y:null}}: t==='settlement'?{name:'New Settlement',size:'hamlet'}: t==='dungeon_entrance'?{name:'New Dungeon Entrance',depth:1}: t==='biome'?{biome:'forest'}:{kind:'road'};
    function open({tile,screen}){ active=true; current={x:tile.x|0,y:tile.y|0}; build(screen); root.style.display='block'; items[0]?.focus?.(); }
    function close(){ if(!active) return; active=false; root.style.display='none'; removeSub(); }
    window.addEventListener('scroll',close,{passive:true}); window.addEventListener('resize',close); window.addEventListener('click',(e)=>{ if(!root.contains(e.target)) close(); }); window.addEventListener('wheel',close,{passive:true});
    return { open, close };
  }

  // Auto boot
  (async ()=>{
    try{
      // Query param ?shard=/static/public/shards/<file>.json
      const qp = new URLSearchParams(location.search).get('shard');
      if (qp) { await loadShard(qp,'URL'); return; }
      await populateList2();
      // Offer to auto-load latest draft, if any
      const d = pickLatestDraft2();
      if (d && confirm(`Load draft for ${d.id}${d.savedAt?` (saved ${new Date(d.savedAt).toLocaleString()})`:''}?`)) {
        ST.baseline = clone(d.shard);
        ST.previews = Array.isArray(d.previews) ? d.previews : [];
        ST.focus = d.focus || { x:-1, y:-1 };
        setStatus('Draft loaded'); setDebug(`draft loaded: ${d.id}`);
        renderAll(d.shard);
        scheduleDraw();
        return;
      }
    }catch(e){ trace('boot:error', e?.message||e); }
  })();

  // Robust list loader (v2)
  async function fetchShardList2(){
    try {
      const data = await getJSON('/api/shards');
      let list = Array.isArray(data) ? data : (Array.isArray(data?.shards) ? data.shards : []);
      if (!Array.isArray(list) || list.length === 0) {
        try { setDebug('fallback: manifest'); const mf = await getJSON('/static/public/shards/manifest.json'); if (Array.isArray(mf)) list = mf; } catch {}
      }
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }
  async function populateList2(){
    setStatus('Loading shard list…'); setDebug('request: /api/shards');
    const items = await fetchShardList2();
    ensureSelect2(); els.select.innerHTML = '';
    for (const it of items) {
      const opt = document.createElement('option');
      const file = (typeof it === 'string') ? it : (it.file || it.name || it.path || '');
      const label = (typeof it === 'string') ? it.replace(/^.*\//,'').replace(/\.json$/,'') : (it.meta?.displayName || file.replace(/\.json$/,''));
      const path = (typeof it === 'string') ? (it.startsWith('/') ? it : `/static/public/shards/${it}`) : (it.path || `/static/public/shards/${file}`);
      opt.value = file; opt.textContent = label; opt.setAttribute('data-path', path); els.select.appendChild(opt);
    }
    setStatus(items.length ? `Loaded ${items.length} shard(s)` : 'No shards found');
    setDebug(items.length ? `ready · ${items.length} shard(s)` : '');
  }

  // -- Tile panel button handlers --
  els.btnTileApply?.addEventListener('click', (e)=>{
    e?.preventDefault?.(); if(!ST.shard || !els.tileJson) return; const {x,y}=ST.focus||{};
    if(!(x>=0 && y>=0)) { setStatus('Select a tile first (left‑click).'); return; }
    const raw = String(els.tileJson.value||'').trim();
    if (!raw) { setStatus('Tile editor is empty. Left‑click a tile to load JSON.'); return; }
    try{
      let obj;
      // Accept bare biome string like plains or "plains"
      if (raw[0] !== '{' && raw[0] !== '[') {
        const biome = raw.replace(/^\"|\"$/g,'');
        obj = { x, y, biome };
      } else {
        // Be lenient on trailing commas
        const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
        obj = JSON.parse(cleaned);
      }
      if (obj && typeof obj==='object'){ if(typeof obj.x!=='number') obj.x = x; if(typeof obj.y!=='number') obj.y = y; }
      if (Array.isArray(ST.shard.tiles) && Array.isArray(ST.shard.tiles[y])){
        ST.shard.tiles[y][x] = obj;
      }
      // Re-derive grid strictly from tiles
      ST.grid = deriveGridFromTiles(ST.shard);
      setStatus('Applied tile changes to draft'); scheduleDraw();
    }catch(err){ setStatus('Invalid tile JSON'); setDebug(`Apply error: ${String(err?.message||err)}`); }
  });
  els.btnTileValidate?.addEventListener('click', async (e)=>{
    e?.preventDefault?.(); els.tileValidateOut && (els.tileValidateOut.textContent=''); els.btnTilePush && (els.btnTilePush.disabled=true);
    try{
      const mod = await import('/static/src/shardViewer/schema.js');
      const canon = mod.migrateToCanonicalShard(ST.shard);
      const res = mod.validateShard(canon);
      els.tileValidateOut && (els.tileValidateOut.textContent = res.ok ? 'Validation OK' : ('Schema issues:\n- '+res.errors.join('\n- ')) );
      if (res.ok) els.btnTilePush && (els.btnTilePush.disabled=false);
    }catch(err){ els.tileValidateOut && (els.tileValidateOut.textContent = 'Validation failed to run: '+String(err?.message||err)); }
  });
  async function doPushLive(e){
    e?.preventDefault?.(); if(!ST.shard) return; try{
      const schema = await import('/static/src/shardViewer/schema.js');
      const apiMod = await import('/static/src/shardViewer/apiClient.js');
      const snapshot = structuredClone(ST.shard); try{ delete snapshot.grid; }catch{}
      const canon = schema.migrateToCanonicalShard(snapshot);
      const res = schema.validateShard(canon);
      if (!res.ok){ setStatus('Cannot push: invalid'); els.tileValidateOut && (els.tileValidateOut.textContent='Fix schema errors before push'); return; }
      const id = (ST.shard?.meta?.name) || (canon.meta?.name) || (canon.shard_id || ST.shard?.shard_id) || 'unknown';
      const url = `/api/shards/${encodeURIComponent(id)}`;
      // Write
      const put = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(canon) });
      if (!put.ok){ const txt = await put.text().catch(()=>String(put.status)); throw new Error(`HTTP ${put.status}: ${txt}`); }
      // Verify by reading back
      const chk = await fetch(url, { headers:{'Accept':'application/json'} });
      if (chk.ok){ setDebug(`saved: ${url}`); logAction('Push Live OK', { url }); }
      ST.baseline = clone(canon);
      setStatus(`Pushed live → ${id}.json`);
      $('btnPushLive')?.classList.add('is-dim'); $('btnPushLive') && ($('btnPushLive').disabled=true); if(els.btnTilePush){ els.btnTilePush.disabled=true; els.btnTilePush.classList.add('is-dim'); }
    }catch(err){ setStatus('Push failed'); setDebug(String(err?.message||err)); }
  }
  els.btnTilePush?.addEventListener('click', doPushLive);
  $('btnPushLive')?.addEventListener('click', doPushLive);

  // ---- Draft / Undo helpers ----
  function clone(obj){ try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); } }
  function draftKey2(){ const id = ST.shard?.shard_id || ST.shard?.meta?.name || els.select?.value || 'unknown'; return `sv2:draft:${id}`; }
  function saveDraft2(){ if(!ST.shard){ setStatus('No shard loaded'); return; } try { const payload={ savedAt:new Date().toISOString(), shard: ST.shard, previews: ST.previews||[], focus: ST.focus||{x:-1,y:-1} }; localStorage.setItem(draftKey2(), JSON.stringify(payload)); setStatus('Draft saved'); setDebug(`draft saved: ${draftKey2()}`); } catch(e){ setStatus('Draft save failed'); setDebug(String(e?.message||e)); } }
  function revertToBaseline2(){ if(!ST.baseline){ setStatus('No baseline to revert'); return; } const snap = clone(ST.baseline); ST.previews=[]; ST.focus={x:-1,y:-1}; setStatus('Reverted to last save'); setDebug('undo to baseline'); renderAll(snap); }
  function pickLatestDraft2(){ try{ const out=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(!k||!k.startsWith('sv2:draft:')) continue; const id=k.slice('sv2:draft:'.length); let parsed=null; try{ parsed=JSON.parse(localStorage.getItem(k)||'null'); }catch{}; if(!parsed) continue; const shard=parsed.shard||parsed; const savedAt=parsed.savedAt||null; const previews=parsed.previews||[]; const focus=parsed.focus||{x:-1,y:-1}; if (shard) out.push({ id, shard, savedAt, previews, focus }); } if(!out.length) return null; out.sort((a,b)=> new Date(b.savedAt||0)-new Date(a.savedAt||0)); return out[0]; }catch{ return null; } }
  function ensureSelect2(){
    if (els.select) return;
    const host = document.querySelector('.viewer') || document.body;
    const sel = document.createElement('select');
    sel.id = 'shardSelect';
    const btn = document.createElement('button');
    btn.id = 'btnLoad';
    btn.textContent = 'Load';
    host.prepend(btn);
    host.prepend(sel);
    els.select = sel;
    els.loadBtn = btn;
    sel.addEventListener('change', loadSelectedShard);
    btn.addEventListener('click', (e) => { e?.preventDefault?.(); loadSelectedShard(); });
  }
})();




