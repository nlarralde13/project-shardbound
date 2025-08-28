// MVP3 Orchestrator (overlay-owned styling)
// Purpose: orchestration only. No map styling here.

import { initOverlayMap } from '/static/js/overlayMap.js';
import { setShard as setRoomShard, assertCanonicalGrid, buildRoom } from '/static/js/roomLoader.js';
import { applyRoomDelta } from '/static/js/roomPatcher.js';
import { API } from '/static/js/api.js';
import { updateActionHUD } from '/static/js/actionHud.js';

const QS = new URLSearchParams(location.search);
const DEV_MODE = QS.has('devmode');

const USER_TOKEN = (() => {
  const k = 'mvp3_user_token';
  const q = QS.get('token');
  if (q) { localStorage.setItem(k, q); return q; }
  let v = localStorage.getItem(k);
  if (!v) { v = crypto.getRandomValues(new Uint32Array(4)).join('-'); localStorage.setItem(k, v); }
  return v;
})();

// ---- DOM ----
const overlayMapEl = document.getElementById('overlayMap');
const overlayChar  = document.getElementById('overlayChar');
const overlayInv   = document.getElementById('overlayInv');

const btnWorldMap  = document.getElementById('btnWorldMap');
const btnCharacter = document.getElementById('btnCharacter');
const btnInventory = document.getElementById('btnInventory');

const shardSelect  = document.getElementById('shardSelect');
const btnLoadShard = document.getElementById('btnLoadShard');
const shardStatus  = document.getElementById('shardStatus');

const roomTitle    = document.getElementById('roomTitle');
const roomBiome    = document.getElementById('roomBiome');
const roomArt      = document.getElementById('roomArt');

const consoleEl    = document.getElementById('console');
const cmdInput     = document.getElementById('cmd');
const cmdSend      = document.getElementById('cmdSend');

// ---- console log (light) ----
const _log = [];
function log(text, cls='', ts=null){
  const stamp = new Date(ts || Date.now()).toLocaleTimeString();
  _log.push({text:`[${stamp}] ${text}`,cls});
  if (_log.length>300) _log.shift();
  if (!consoleEl) return;
  const frag = document.createDocumentFragment();
  for (const {text:t,cls:c} of _log.slice(-140)) { const d=document.createElement('div'); d.className='line'+(c?' '+c:''); d.textContent=t; frag.appendChild(d); }
  consoleEl.replaceChildren(frag);
}

// ---- overlay instance (visuals live in overlayMap.js) ----
const overlay = initOverlayMap?.({ devMode: DEV_MODE });

// small helpers
const toggle = (el, force) => { if (!el) return; const show = (typeof force==='boolean') ? force : el.classList.contains('hidden'); el.classList.toggle('hidden', !show); };
const openMap = () => { overlayMapEl?.classList.remove('hidden'); overlay?.render?.(); };
const closeMap = () => overlayMapEl?.classList.add('hidden');
const toggleMap = () => overlayMapEl?.classList.contains('hidden') ? openMap() : closeMap();

// ---- state ----
let CurrentPos = { x: 0, y: 0 };

// Room patching from server deltas
window.patchRoom = (delta) => {
  window.currentRoom = applyRoomDelta(window.currentRoom || {}, delta || {});
  const hostiles = (window.currentRoom?.enemies || []).some(e => (e.hp_now ?? e.hp) > 0);
  const room = buildRoom(CurrentPos.x, CurrentPos.y, { mode: hostiles ? 'combat' : 'idle' });
  renderRoomInfo(room, { flavor: false });
  if (Array.isArray(window.currentRoom?.quests) && window.currentRoom.quests.length) {
    const q = window.currentRoom.quests[0];
    const key = `${CurrentPos.x},${CurrentPos.y}:${q.id}`;
    if (window.patchRoom._k !== key) { log(`Quest available: ${q.title}`, 'log-quest'); window.patchRoom._k = key; }
  }
};

// ---- room render (keeps your working art swap) ----
let __anim = null;
function renderRoomInfo(room, { flavor = true } = {}) {
  if (__anim?.raf) cancelAnimationFrame(__anim.raf);
  __anim = null;
  roomTitle && (roomTitle.textContent = room.title || '');
  roomBiome && (roomBiome.textContent = room.subtitle || '');

  if (roomArt) roomArt.classList.add('fade-out');
  roomArt.style.backgroundImage    = 'none';
  roomArt.style.backgroundSize     = '';
  roomArt.style.backgroundPosition = '';
  roomArt.style.backgroundRepeat   = '';
  void roomArt.offsetWidth;

  const art = room.art || {};
  roomArt.style.backgroundImage    = art.image || 'none';
  roomArt.style.backgroundSize     = art.size || '';
  roomArt.style.backgroundPosition = art.position || '';
  roomArt.style.backgroundRepeat   = art.repeat || '';
  setTimeout(()=>roomArt.classList.remove('fade-out'), 80);

  if (flavor && room.description) {
    const key = `${room.x},${room.y}:${room.biome}:${room.label||'none'}`;
    if (renderRoomInfo._k !== key) { log(room.description, 'log-flavor'); renderRoomInfo._k = key; }
  }

  if (Array.isArray(art.frames) && art.frames.length>1 && typeof art.animIndex==='number') {
    const frameMS = Math.max(60, Number(art.frame_ms || 120));
    __anim = { idx:0, total:art.frames.length, animLayer:art.animIndex, base:Array.isArray(art.layers)?art.layers.slice():[], acc:0, ms:frameMS, raf:null, last:0 };
    const step = (ts) => {
      if (!__anim) return;
      if (!__anim.last) __anim.last = ts;
      const dt = ts - __anim.last; __anim.last = ts; __anim.acc += dt;
      while (__anim.acc >= __anim.ms) {
        __anim.acc -= __anim.ms; __anim.idx = (__anim.idx+1) % __anim.total;
        const layers = __anim.base.slice(); layers[__anim.animLayer] = `url("${art.frames[__anim.idx]}")`;
        roomArt.style.backgroundImage    = layers.join(', ');
        roomArt.style.backgroundSize     = new Array(layers.length).fill('cover').join(', ');
        roomArt.style.backgroundPosition = new Array(layers.length).fill('center').join(', ');
        roomArt.style.backgroundRepeat   = new Array(layers.length).fill('no-repeat').join(', ');
      }
      __anim.raf = requestAnimationFrame(step);
    };
    __anim.raf = requestAnimationFrame(step);
  }
}

// ---- movement events (from HUD/server only; no keyboard here) ----
window.addEventListener('game:moved', (ev) => {
  const d = ev?.detail || {}; if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
  CurrentPos = { x: d.x, y: d.y };
  const hostiles = window.currentRoom?.enemies?.some(e => (e.hp_now ?? e.hp) > 0);
  const room = buildRoom(d.x, d.y, { mode: hostiles ? 'combat' : 'idle' });
  renderRoomInfo(room);
  overlay?.setPos?.(d.x, d.y); overlay?.render?.();
});

// Route server log events into local console
window.addEventListener('game:log', (ev) => {
  const events = ev.detail || [];
  for (const e of events) {
    const cls = e.type && e.type !== 'log' ? `log-${e.type}` : '';
    log(e.text || String(e), cls, e.ts);
  }
});

// ---- keyboard for overlays only (M/C/I/ESC) ----
const isTyping = (t)=>!t?false:(t.tagName==='TEXTAREA')||(t.tagName==='INPUT'&&!['checkbox','radio','button','range','submit','reset','file','color'].includes((t.type||'').toLowerCase()))||t.isContentEditable===true;
window.addEventListener('keydown', (e)=>{
  if (isTyping(e.target)) return;
  const k = e.key?.toLowerCase?.();
  if (k==='m'){ e.preventDefault(); toggleMap(); }
  if (k==='c'){ e.preventDefault(); toggle(overlayChar); }
  if (k==='i'){ e.preventDefault(); toggle(overlayInv); }
  if (k==='escape'){ e.preventDefault(); closeMap(); overlayChar?.classList.add('hidden'); overlayInv?.classList.add('hidden'); }
});

// ---- shard picker ----
function normalizeShardList(items){ const out=[]; if(!Array.isArray(items)) return out;
  for(const it of items){
    if (typeof it==='string'){ const s=it.trim(); if(s) out.push({name:s.replace(/^.*\//,''), url:s}); continue; }
    if (it && typeof it==='object'){ const url=typeof it.url==='string'?it.url:null; if(!url) continue; const name=(typeof it.name==='string'&&it.name.trim())?it.name.trim():url.replace(/^.*\//,''); out.push({name,url}); }
  } return out;
}

async function fetchShardList(){
  try{
    const r=await fetch('/api/shards',{headers:{'Accept':'application/json'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw=await r.json(); const list=normalizeShardList(raw); if(list.length) return list; throw new Error('empty');
  }catch{
    return normalizeShardList([
      { name:'Starter (local)', url:'/static/public/shards/00089451_test123.json' },
      '/static/public/shards/00089451_test123.json'
    ]);
  }
}

async function populateShardPicker(items){
  if(!shardSelect) return;
  const list = normalizeShardList(items); shardSelect.replaceChildren();
  if(!list.length){ const o=document.createElement('option'); o.value=''; o.textContent='— No shards found —'; shardSelect.appendChild(o); return; }
  for(const {name,url} of list){ const o=document.createElement('option'); o.value=url; o.textContent=name; shardSelect.appendChild(o); }
  const d='/static/public/shards/00089451_test123.json';
  if (![...shardSelect.options].some(o=>o.value===d)){ const o=document.createElement('option'); o.value=d; o.textContent='Starter (default)'; shardSelect.appendChild(o); }
  if(!shardSelect.value) shardSelect.value = d;
}

// ---- shard load ----
async function loadShard(url){
  if(!url||typeof url!=='string'){ shardStatus&&(shardStatus.textContent='Invalid shard URL'); throw new Error('bad url'); }
  shardStatus&&(shardStatus.textContent='Loading…');
  const res = await fetch(url); if(!res.ok){ shardStatus&&(shardStatus.textContent=`Load failed (${res.status})`); throw new Error('fetch fail'); }
  const shard = await res.json();

  // dev fallback so POIs exist
  if (DEV_MODE && (!Array.isArray(shard.sites) || shard.sites.length===0)){
    const gw = shard.grid?.[0]?.length || 40, gh = shard.grid?.length || 40;
    shard.sites = [{x:Math.floor(gw/2),y:Math.floor(gh/2)-1,type:'town',name:'Larkstead'},{x:3,y:3,type:'port',name:'Drift Haven'}];
  }

  assertCanonicalGrid(shard.grid);
  setRoomShard(shard);

  const gw=shard.grid?.[0]?.length||0, gh=shard.grid?.length||0;
  const spawn = shard.spawn || [Math.floor(gw/2), Math.floor(gh/2)];
  CurrentPos = { x:spawn[0], y:spawn[1] };

  renderRoomInfo(buildRoom(CurrentPos.x, CurrentPos.y), { flavor:true });

  // overlay sync (overlay fully owns visuals)
  overlay?.setToken?.(USER_TOKEN);
  overlay?.setPos?.(CurrentPos.x, CurrentPos.y);
  overlay?.setShard?.(shard);
  overlay?.render?.();

  window.dispatchEvent(new CustomEvent('game:log', {
    detail: [{ text: `Shard loaded. Local spawn at (${CurrentPos.x},${CurrentPos.y})`, ts: Date.now() }]
  }));

  window.__lastShard = shard;
  shardStatus && (shardStatus.textContent = 'Loaded');
}

// ---- UI wires ----
btnLoadShard?.addEventListener('click', async ()=>{ const url=shardSelect?.value; if(!url) return; try{ await loadShard(url); }catch{} });
shardSelect?.addEventListener('change', ()=>btnLoadShard?.click());
btnWorldMap?.addEventListener('click', ()=>toggleMap());
btnCharacter?.addEventListener('click', ()=>toggle(overlayChar));
btnInventory?.addEventListener('click', ()=>toggle(overlayInv));

cmdSend?.addEventListener('click', ()=>{ runCommand(cmdInput.value); cmdInput.value=''; });
cmdInput?.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ runCommand(cmdInput.value); cmdInput.value=''; }});

async function runCommand(input){
  const parts = (input||'').trim().split(/\s+/);
  const t = parts[0]?.toLowerCase();
  if(!t) return;

  const DIRS = { n:[0,-1], e:[1,0], s:[0,1], w:[-1,0] };

  if(t==='help'){
    log('Commands: move n|s|e|w, search, gather, attack, talk, rest, enter', 'log-note');
    return;
  }

  if(t==='move' && parts[1]){
    const d = DIRS[parts[1][0].toLowerCase()];
    if(!d){ log('Unknown direction. Type "help".', 'log-note'); return; }
    try{
      const res = await API.move(d[0], d[1]);
      if(res?.log) window.dispatchEvent(new CustomEvent('game:log',{ detail: res.log.map(text=>({ text, ts: Date.now() })) }));
      if(res?.room_delta) window.patchRoom?.(res.room_delta);
      if(res?.room) window.patchRoom?.({ ...res.room });
      const pos = res?.player?.pos || [];
      if(pos.length===2) window.dispatchEvent(new CustomEvent('game:moved',{ detail:{ x:pos[0], y:pos[1] }}));
      if(res?.interactions) updateActionHUD({ interactions: res.interactions });
    }catch(e){ console.error(e); }
    return;
  }

  if(['search','gather','attack','talk'].includes(t)){
    try{
      const out = await API.action(t);
      if(out?.events) window.dispatchEvent(new CustomEvent('game:log',{ detail: out.events.map(e=>({ ...e, ts: e.ts||Date.now() })) }));
      if(out?.room_delta) window.patchRoom?.(out.room_delta);
      if(out?.interactions) updateActionHUD({ interactions: out.interactions });
    }catch(e){ console.error(e); }
    return;
  }

  if(t==='enter'){
    try{
      const out = await API.interact();
      if(out?.log) window.dispatchEvent(new CustomEvent('game:log',{ detail: out.log.map(text=>({ text, ts: Date.now() })) }));
    }catch(e){ console.error(e); }
    return;
  }

  if(t==='rest'){
    window.dispatchEvent(new CustomEvent('game:log',{ detail:[{ text:'You rest. (+2 HP, +2 STA)', ts: Date.now() }] }));
    return;
  }

  log('Unknown command. Type "help".', 'log-note');
}

// ---- boot ----
(async ()=>{
  try{
    const items = await fetchShardList();
    await populateShardPicker(items);
    const current = shardSelect?.value || '/static/public/shards/00089451_test123.json';
    await loadShard(current);
    document.getElementById('mapUserToken')?.replaceChildren(document.createTextNode(`Token: ${USER_TOKEN}`));
  }catch(e){
    console.warn('Auto-load failed:', e);
    shardStatus && (shardStatus.textContent='Please select a shard to load.');
  }
})();
