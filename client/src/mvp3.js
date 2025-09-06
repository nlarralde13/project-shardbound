// MVP3 Orchestrator (overlay-owned styling)
// Purpose: orchestration only. No map styling here.

import { initOverlayMap } from '/static/js/overlayMap.js';
import { setShard as setRoomShard, assertCanonicalTiles, buildRoom } from '/static/js/roomLoader.js';
import { applyRoomDelta } from '/static/js/roomPatcher.js';
import { API, autosaveCharacterState } from '/static/js/api.js';
import { updateActionHUD } from '/static/js/actionHud.js';
import { initInventoryPanel, addItem as addInvItem, removeItem as removeInvItem } from './ui/inventoryPanel.js';
import { mountConsole } from './console/consoleUI.js';
import { dispatch } from './console/dispatch.js';
import { parse } from './console/parse.js';

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
const overlayChar  = document.getElementById('overlayChar');
const overlayInv   = document.getElementById('overlayInv');

const btnCharacter = document.getElementById('btnCharacter');
const btnInventory = document.getElementById('btnInventory');

const shardSelect  = document.getElementById('shardSelect');
const btnLoadShard = document.getElementById('btnLoadShard');
const shardStatus  = document.getElementById('shardStatus');

const roomTitle    = document.getElementById('roomTitle');
const roomBiome    = document.getElementById('roomBiome');


const statHP       = document.getElementById('statHP');
const statMP       = document.getElementById('statMP');
const statSTA      = document.getElementById('statSTA');
const statHunger   = document.getElementById('statHunger');
const consoleRoot  = document.getElementById('console-root');

async function apiExec(line, context = {}) {
  const res = await fetch('/api/console/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line, context })
  });
  return res.json();
}

async function onSubmit(line, ctx) {
  const parsed = parse(line);
  if (parsed.error) return [{ type: 'text', data: parsed.error }];
  const frames = await dispatch(parsed, { rpcExec: ({ line }) => apiExec(line, ctx) });
  return frames;
}

const Console = mountConsole(consoleRoot, { onSubmit });
const { print: consolePrint, setPrompt: consoleSetPrompt, setStatus: consoleSetStatus } = Console;
Console.bindHotkeys();
window.consolePrint = consolePrint;
window.consoleSetPrompt = consoleSetPrompt;
window.consoleSetStatus = consoleSetStatus;
window.__consoleV2 = { apiExec };

function updateCharHud(p = {}){
  if(statHP && Number.isFinite(p.hp) && Number.isFinite(p.max_hp)){
    statHP.style.width = Math.max(0, Math.min(100, (p.hp / p.max_hp) * 100)) + '%';
  }
  if(statMP && Number.isFinite(p.mp) && Number.isFinite(p.max_mp)){
    statMP.style.width = Math.max(0, Math.min(100, (p.mp / p.max_mp) * 100)) + '%';
  }
  const stam = Number.isFinite(p.stamina) ? p.stamina : p.energy;
  const maxStam = Number.isFinite(p.max_stamina) ? p.max_stamina : (p.max_energy ?? 100);
  if(statSTA && Number.isFinite(stam) && Number.isFinite(maxStam)){
    statSTA.style.width = Math.max(0, Math.min(100, (stam / maxStam) * 100)) + '%';
  }
  if(statHunger && Number.isFinite(p.hunger)){
    statHunger.textContent = `Hunger: ${p.hunger}`;
  }
}

window.updateCharHud = updateCharHud;

// ---- console log (light) ----
const _log = [];
function log(text, cls='', ts=null){
  const stamp = new Date(ts || Date.now()).toLocaleTimeString();
  const line = `[${stamp}] ${text}`;
  _log.push({ text: line, cls });
  if (_log.length > 300) _log.shift();
  consolePrint(line, { mode: cls ? 'system' : 'normal' });
}

// ---- overlay instance (visuals live in overlayMap.js) ----
const overlay = initOverlayMap?.({ devMode: DEV_MODE });

// small helpers
const toggle = (el, force) => { if (!el) return; const show = (typeof force==='boolean') ? force : el.classList.contains('hidden'); el.classList.toggle('hidden', !show); };

// ---- state ----
let CurrentPos = { x: 0, y: 0 };

// Room patching from engine deltas
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

// ---- room render ----
function renderRoomInfo(room, { flavor = true } = {}) {
  if (!room) return;
  roomTitle && (roomTitle.textContent = room.title || '');
  roomBiome && (roomBiome.textContent = room.subtitle || room.biome || '');
  if (flavor && room.description) {
    const key = `${room.x},${room.y}:${room.biome}:${room.label||'none'}`;
    if (renderRoomInfo._k !== key) { log(room.description, 'log-flavor'); renderRoomInfo._k = key; }
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
  if (k==='c'){ e.preventDefault(); toggle(overlayChar); }
  if (k==='i'){ e.preventDefault(); toggle(overlayInv); }
  if (k==='escape'){ e.preventDefault(); overlayChar?.classList.add('hidden'); overlayInv?.classList.add('hidden'); }
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
    const gw = shard.tiles?.[0]?.length || 40, gh = shard.tiles?.length || 40;
    shard.sites = [{x:Math.floor(gw/2),y:Math.floor(gh/2)-1,type:'town',name:'Larkstead'},{x:3,y:3,type:'port',name:'Drift Haven'}];
  }

  assertCanonicalTiles(shard.tiles);
  setRoomShard(shard);

  const gw=shard.tiles?.[0]?.length||0, gh=shard.tiles?.length||0;
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


// Close buttons inside panels
overlayChar?.querySelector('[data-close="char"]')
  ?.addEventListener('click', () => overlayChar.classList.add('hidden'));
overlayInv?.querySelector('[data-close="inv"]')
  ?.addEventListener('click', () => overlayInv.classList.add('hidden'));

// Click on the dark backdrop closes (but not when clicking inside .panel)
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const overlay = target.closest('.overlay');
  if (!overlay) return;
  const panel = target.closest('.panel');
  if (!panel) overlay.classList.add('hidden');
});

// ---- UI wires ----
btnLoadShard?.addEventListener('click', async ()=>{ const url=shardSelect?.value; if(!url) return; try{ await loadShard(url); }catch{} });
shardSelect?.addEventListener('change', ()=>btnLoadShard?.click());
btnCharacter?.addEventListener('click', ()=>toggle(overlayChar));
btnInventory?.addEventListener('click', ()=>toggle(overlayInv));

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

// periodic autosave of position + lightweight state
setInterval(() => {
  const payload = {
    x: CurrentPos.x,
    y: CurrentPos.y,
    state: {
      last_room_id: window.currentRoomId || null,
      inventory: window.playerInventory || [],
      quests: window.currentQuests || { active: [], completed: [] },
    },
  };
  if (window.__lastShard?.meta?.name) payload.shard_id = window.__lastShard.meta.name;
  autosaveCharacterState(payload).catch(() => { /* swallow in UI */ });
}, 60_000);

// Inventory panel demo wiring
document.addEventListener('DOMContentLoaded', () => {
  const characterId = window.SHARDBOUND?.characterId || 'demo-character-id';
  const mount = document.getElementById('inventory-root');
  if (mount) {
    initInventoryPanel({ characterId, mountEl: mount });
  }
  document.getElementById('btn-add-potion')?.addEventListener('click', () => {
    addInvItem(characterId, 'health-potion', 1);
  });
  document.getElementById('btn-remove-potion')?.addEventListener('click', () => {
    removeInvItem(characterId, 'health-potion', 1);
  });
});
