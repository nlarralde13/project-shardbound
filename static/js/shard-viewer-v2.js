// shard-viewer-v2 - minimal, working, debuggable overlay
// Vanilla ES module; no bundler.

(() => {
  // Utilities
  const $ = (id) => document.getElementById(id);
  const trace = (step, extra) => { try { console.log('[SV2]', step, extra ?? ''); } catch {} };
  const setStatus = (m) => { const el = $('status'); if (el) el.textContent = m; };
  const setDebug = (m) => { const el = $('debugBadge'); if (!el) return; el.textContent = m || ''; el.style.opacity = m ? '1' : '0'; };

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
    layerShardgates: $('layerShardgates')
  };
  if (!els.base) { const c=document.createElement('canvas'); c.id='canvas'; els.frame?.appendChild(c); els.base=c; }

  // Overlay canvas
  const overlay = document.createElement('canvas'); overlay.id='overlayCanvasV2'; overlay.style.pointerEvents='none';
  els.frame?.appendChild(overlay); const octx = overlay.getContext('2d');
  const dpr = () => window.devicePixelRatio || 1;
  const scale = () => Math.max(1, parseInt(els.scale?.value||'8',10));
  const alpha = () => Math.max(0, Math.min(1,(parseInt(els.opacity?.value||'85',10)||85)/100));

  // State
  const ST = { shard:null, grid:null, previews: [], focus:{ x:-1, y:-1 }, baseline: null, panX: 0, panY: 0 };

  // Fetch JSON
  async function getJSON(url){ trace('fetch', url); const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

  // Grid helpers
  const looks2D = (a)=>Array.isArray(a)&&a.length&&Array.isArray(a[0]);
  function normalize2D(twoD){ if(!Array.isArray(twoD)) return []; const out=new Array(twoD.length); for(let y=0;y<twoD.length;y++){ const row=twoD[y], line=new Array(row.length); for(let x=0;x<row.length;x++){ const cell=row[x]; if(typeof cell==='string') line[x]=cell; else if(cell&&typeof cell.tile==='string') line[x]=cell.tile; else if(cell&&typeof cell.biome==='string') line[x]=cell.biome; else line[x]='plains'; } out[y]=line; } return out; }
  function findGrid(shard){ if(looks2D(shard?.grid)) return normalize2D(shard.grid); if(looks2D(shard?.tiles)) return normalize2D(shard.tiles); for(const k of Object.keys(shard||{})){ const v=shard[k]; if(looks2D(v)) return normalize2D(v); } return []; }

  // Canvas sizing
  function ensureSizes(W,H){ const s=scale(); if(!W||!H) return; if(els.base.width!==W*s||els.base.height!==H*s){ els.base.width=W*s; els.base.height=H*s; els.base.style.width=`${W*s}px`; els.base.style.height=`${H*s}px`; }
    overlay.width=Math.max(2,Math.floor(W*s*dpr())); overlay.height=Math.max(2,Math.floor(H*s*dpr())); overlay.style.width=`${W*s}px`; overlay.style.height=`${H*s}px`; applyPan(); }

  function applyPan(){ const x = Math.round(ST.panX||0), y = Math.round(ST.panY||0); els.base.style.left = x+"px"; els.base.style.top = y+"px"; overlay.style.left = x+"px"; overlay.style.top = y+"px"; }

  function centerInFrame(){ const fw = els.frame?.clientWidth||0, fh = els.frame?.clientHeight||0; const cw = els.base?.width||0, ch = els.base?.height||0; ST.panX = Math.round((fw - cw)/2); ST.panY = Math.round((fh - ch)/2); applyPan(); }

  // Draw base biomes
  function biomeColor(id){ const m={ ocean:'#0b3a74', coast:'#d9c38c', beach:'#d9c38c', plains:'#91c36e', forest:'#2e7d32', tundra:'#b2c2c2', desert:'#e0c067', hills:'#97b06b', mountains:'#8e3c3c' }; return m[String(id).toLowerCase()]||'#889'; }
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
    if(els.layerShardgates?.checked){ const gates=(ST.shard?.layers?.shardgates?.nodes||[]).concat(ST.shard?.shardgates?.nodes||[]).concat((ST.shard?.pois||[]).filter(p=>p?.type==='shardgate'));
      octx.save(); octx.globalAlpha=Math.max(.9,alpha()); octx.fillStyle='#7b5cff'; octx.strokeStyle='#000'; octx.lineWidth=1;
      for(const g1 of gates){ const x=(g1.x??g1[0])|0, y=(g1.y??g1[1])|0; const cx=(x+.5)*s, cy=(y+.5)*s, R=Math.max(3,Math.round(s*.36)); octx.beginPath(); octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy); octx.lineTo(cx,cy+R); octx.lineTo(cx-R,cy); octx.closePath(); octx.fill(); octx.stroke(); octx.beginPath(); octx.strokeStyle='rgba(255,255,255,.9)'; octx.arc(cx,cy,Math.max(2,Math.round(R*.55)),0,Math.PI*2); octx.stroke(); const name=(g1.name||g1.id||'Gate'); drawLabel(cx, cy, name, true); }
      octx.restore(); }
    // settlements + POIs
    if(els.layerSettlements?.checked){ drawSettlementsAndPOIs(); }
    // focus border
    if (ST.focus && ST.focus.x>=0 && ST.focus.y>=0){ const fx=ST.focus.x, fy=ST.focus.y; const fpx=fx*s, fpy=fy*s; octx.save(); octx.globalAlpha=1; octx.strokeStyle='rgba(255,214,10,0.95)'; octx.fillStyle='rgba(255,214,10,0.12)'; octx.lineWidth=2; octx.fillRect(fpx,fpy,s,s); octx.strokeRect(fpx+0.5,fpy+0.5,s-1,s-1); octx.restore(); }
    // previews
    drawPreviews();
  }

  function drawPreviews(){ const s=scale(); if(!ST.previews?.length) return; octx.save(); for(const p of ST.previews){ const x=p.x|0,y=p.y|0; const cx=(x+.5)*s, cy=(y+.5)*s; const R=Math.max(3,Math.round(s*.36)); switch(p.type){ case 'shardgate': { octx.globalAlpha=Math.max(.9,alpha()); octx.fillStyle='#7b5cff'; octx.strokeStyle='#000'; octx.lineWidth=1; octx.beginPath(); octx.moveTo(cx,cy-R); octx.lineTo(cx+R,cy); octx.lineTo(cx,cy+R); octx.lineTo(cx-R,cy); octx.closePath(); octx.fill(); octx.stroke(); octx.beginPath(); octx.strokeStyle='rgba(255,255,255,0.95)'; octx.arc(cx,cy,Math.max(2,Math.round(R*.55)),0,Math.PI*2); octx.stroke(); break; } case 'settlement': { const r=Math.max(2,Math.round(s*.22)); octx.globalAlpha=1; octx.fillStyle='#4caf50'; octx.strokeStyle='#1b263b'; octx.lineWidth=1; octx.beginPath(); octx.arc(cx,cy,r,0,Math.PI*2); octx.fill(); octx.stroke(); break; } case 'dungeon_entrance': { const r=Math.max(3,Math.round(s*.26)); octx.globalAlpha=1; octx.fillStyle='#ff5252'; octx.strokeStyle='#1b263b'; octx.lineWidth=1; octx.beginPath(); octx.moveTo(cx,cy-r); octx.lineTo(cx+r,cy+r); octx.lineTo(cx-r,cy+r); octx.closePath(); octx.fill(); octx.stroke(); break; } case 'biome': { const px=x*s, py=y*s; octx.globalAlpha=1; octx.fillStyle='rgba(60,120,60,0.22)'; octx.strokeStyle='rgba(60,120,60,0.85)'; octx.lineWidth=1.5; octx.fillRect(px,py,s,s); octx.strokeRect(px+0.5,py+0.5,s-1,s-1); break; } case 'infrastructure': default: { const r=Math.max(2,Math.round(s*.28)); octx.globalAlpha=1; octx.strokeStyle='#a0a4ad'; octx.lineWidth=Math.max(1,Math.round(s*.12)); octx.beginPath(); octx.moveTo(cx-r,cy); octx.lineTo(cx+r,cy); octx.stroke(); } } if (s>=12){ octx.font=`${Math.max(10,Math.round(s*.5))}px system-ui`; octx.textAlign='center'; octx.textBaseline='top'; octx.strokeStyle='rgba(0,0,0,.65)'; octx.lineWidth=3; const label=(p.type||'item').replace('_',' '); octx.strokeText(label,cx,cy+R+2); octx.fillStyle='#fff'; octx.fillText(label,cx,cy+R+2); } } octx.restore(); }

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
  }

  // Load list

  async function loadSelectedShard(){ const opt=els.select?.selectedOptions?.[0]; if(!opt){ trace('loadSelectedShard:no-selection'); return; } const path=opt.getAttribute('data-path')||`/static/public/shards/${opt.value}`; try{ setDebug(`GET ${path}`); const shard=await getJSON(path); if(!shard) throw new Error('invalid JSON'); setStatus(`Loaded: ${shard?.meta?.displayName || opt.textContent}`); setDebug(`loaded ${path}`); ST.baseline = clone(shard); renderAll(shard); }catch(e){ setStatus(`Failed to load shard: ${e.message}`); setDebug(`error ${e.message} · ${path}`); trace('loadSelectedShard:error', e?.message||e); } }

  function renderAll(shard){ if(!shard){ return; } trace('renderAll:start'); ST.shard=shard; ST.grid=findGrid(shard); const H=ST.grid.length, W=H?ST.grid[0].length:0; ensureSizes(W,H); centerInFrame(); drawBase(); drawOverlay(); trace('renderAll:complete', {W,H}); }

  // Event wiring
  els.loadBtn?.addEventListener('click', (e)=>{ e.preventDefault(); loadSelectedShard(); });
  els.select?.addEventListener('change', ()=> loadSelectedShard());
  els.scale?.addEventListener('input', ()=> { if(!ST.grid) return; ensureSizes(ST.grid[0]?.length||0, ST.grid.length||0); drawBase(); drawOverlay(); });
  els.grid?.addEventListener('change', ()=> drawOverlay());
  els.opacity?.addEventListener('input', ()=> drawOverlay());
  els.layerBiomes?.addEventListener('change', ()=> { drawBase(); drawOverlay(); });
  els.layerInfra?.addEventListener('change', ()=> drawOverlay());
  els.layerSettlements?.addEventListener('change', ()=> drawOverlay());
  els.layerShardgates?.addEventListener('change', ()=> drawOverlay());

  // Zoom and pan controls
  function setScalePx(px){ px=Math.max(4, Math.min(64, Math.round(px))); if(els.scale){ els.scale.value=String(px); } if(ST.grid){ ensureSizes(ST.grid[0]?.length||0, ST.grid.length||0); drawBase(); drawOverlay(); } }
  function zoomAt(fx, fy, factor){ const s1=scale(); const s2=Math.max(4, Math.min(64, Math.round(s1*factor))); if(s2===s1) return; const k=s2/s1; const panX=ST.panX||0, panY=ST.panY||0; ST.panX = Math.round(fx - (fx - panX)*k); ST.panY = Math.round(fy - (fy - panY)*k); setScalePx(s2); applyPan(); }
  els.frame?.addEventListener('wheel', (e)=>{ e.preventDefault(); const fx=e.clientX - (els.frame.getBoundingClientRect().left); const fy=e.clientY - (els.frame.getBoundingClientRect().top); const factor = (e.deltaY>0)? 0.9 : 1.1; zoomAt(fx, fy, factor); }, { passive:false });
  let dragging=false, dragStartX=0, dragStartY=0, startPanX=0, startPanY=0;
  els.frame?.addEventListener('mousedown', (e)=>{ if(e.button!==0) return; dragging=true; dragStartX=e.clientX; dragStartY=e.clientY; startPanX=ST.panX||0; startPanY=ST.panY||0; els.frame.style.cursor='grabbing'; });
  window.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx=e.clientX-dragStartX, dy=e.clientY-dragStartY; ST.panX=startPanX+dx; ST.panY=startPanY+dy; applyPan(); });
  window.addEventListener('mouseup', ()=>{ if(dragging){ dragging=false; els.frame.style.cursor='default'; } });
  $('btnZoomIn')?.addEventListener('click', (e)=>{ e.preventDefault(); const rect=els.frame.getBoundingClientRect(); zoomAt(rect.width/2, rect.height/2, 1.2); });
  $('btnZoomOut')?.addEventListener('click', (e)=>{ e.preventDefault(); const rect=els.frame.getBoundingClientRect(); zoomAt(rect.width/2, rect.height/2, 0.8); });
  $('btnFit')?.addEventListener('click', (e)=>{ e.preventDefault(); centerInFrame(); });
  // Undo to last baseline + Save draft
  $('btnUndoToSave')?.addEventListener('click', (e)=>{ e.preventDefault(); revertToBaseline2(); });
  $('btnSaveDraft')?.addEventListener('click', (e)=>{ e.preventDefault(); saveDraft2(); });

  // Context menu for placement
  const ctx = createContextMenuV2({ onSelect: onPlaceSelect });
  els.frame?.addEventListener('contextmenu', (e)=>{
    if(!ST.grid) return; e.preventDefault(); const rect=els.base.getBoundingClientRect(); const s=scale(); const x=Math.floor((e.clientX-rect.left)/s), y=Math.floor((e.clientY-rect.top)/s); if(x<0||y<0||y>=ST.grid.length||x>=ST.grid[0].length) return; ST.focus={x,y}; drawOverlay(); ctx.open({ tile:{x,y}, screen:{ left:e.clientX, top:e.clientY } });
  });

  function onPlaceSelect(sel){ const detail={ shard_id: ST.shard?.shard_id || ST.shard?.meta?.name || 'unknown', tile:{ x: sel.tile.x, y: sel.tile.y }, place:{ type: sel.type, defaults: sel.defaults||{} }, source:'contextMenu' }; document.dispatchEvent(new CustomEvent('editor:placeRequested', { detail })); ST.previews.push({ x: sel.tile.x, y: sel.tile.y, type: sel.type, defaults: sel.defaults||{} }); drawOverlay(); }

  function createContextMenuV2({ onSelect }){
    const root=document.createElement('div'); root.className='ctx-menu'; root.style.display='none'; document.body.appendChild(root);
    let active=false, submenu=null, items=[], focusIdx=0, current={x:0,y:0};
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)); const focus=(i)=>{ focusIdx=clamp(i,0,items.length-1); items[focusIdx]?.focus?.(); };
    const removeSub=()=>{ submenu?.remove?.(); submenu=null; };
    const openSub=()=>{ removeSub(); submenu=document.createElement('div'); submenu.className='ctx-submenu'; document.body.appendChild(submenu); const entries=[['Shardgate','shardgate'],['Settlement','settlement'],['Dungeon Entrance','dungeon_entrance'],['Biome','biome'],['Infrastructure','infrastructure']]; for(const [lbl,t] of entries){ const b=document.createElement('button'); b.className='ctx-item'; b.textContent=lbl; b.addEventListener('click',()=>emit(t)); submenu.appendChild(b);} const rb=root.getBoundingClientRect(); const sbw=220,sbh=entries.length*30+12; const left=(rb.right+sbw<innerWidth)?rb.right:Math.max(0,rb.left-sbw); const top=(rb.top+sbh<innerHeight)?rb.top:Math.max(0,innerHeight-sbh); submenu.style.left=left+'px'; submenu.style.top=top+'px'; };
    const build=(screen)=>{ root.innerHTML=''; const m=document.createElement('button'); m.textContent='Place ?'; m.className='ctx-item'; m.setAttribute('aria-haspopup','true'); const sep=document.createElement('div'); sep.className='ctx-sep'; const c=document.createElement('button'); c.textContent='Cancel'; c.className='ctx-item'; root.appendChild(m); root.appendChild(sep); root.appendChild(c); items=[m,c]; focus(0); m.addEventListener('mouseenter',openSub); m.addEventListener('click',openSub); c.addEventListener('click',close); root.onkeydown=(e)=>{ if(e.key==='Escape'){e.preventDefault();close();} else if(e.key==='ArrowDown'){e.preventDefault();focus(focusIdx+1);} else if(e.key==='ArrowUp'){e.preventDefault();focus(focusIdx-1);} else if(e.key==='ArrowRight'){e.preventDefault();openSub(); submenu?.querySelector('button')?.focus();} else if(e.key==='ArrowLeft'){e.preventDefault(); removeSub(); } else if(e.key==='Enter'){e.preventDefault(); items[focusIdx]?.click?.(); } };
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
      if (qp) { const s = await getJSON(qp); setStatus('Loaded via URL'); ST.baseline = clone(s); renderAll(s); return; }
      await populateList2();
      // Offer to auto-load latest draft, if any
      const d = pickLatestDraft2();
      if (d && confirm(`Load draft for ${d.id}${d.savedAt?` (saved ${new Date(d.savedAt).toLocaleString()})`:''}?`)) {
        ST.baseline = clone(d.shard);
        setStatus('Draft loaded'); setDebug(`draft loaded: ${d.id}`);
        renderAll(d.shard);
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
    btn.addEventListener('click', (e) => { e.preventDefault(); loadSelectedShard(); });
  }
})();


