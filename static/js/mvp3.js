// MVP3 Orchestrator — preserves existing behavior, adds safer shard loading & Console v2 wiring

// ==== GAME/VIEW IMPORTS (keep your existing modules) ====
import { initOverlayMap } from '/static/js/overlayMap.js';
import {
  setRoomShard,
  assertCanonicalTiles,
  buildRoom,
  summarizeBiomes
} from '/static/js/roomLoader.js';
import { applyRoomDelta } from '/static/js/roomPatcher.js';
import { API, autosaveCharacterState } from '/static/js/api.js';
import { updateActionHUD } from '/static/js/actionHud.js';
import {
  initInventoryPanel,
  addItem as addInvItem,
  removeItem as removeInvItem
} from '/static/src/ui/inventoryPanel.js';

// ==== CONSOLE V2 IMPORTS ====
import {
  mountConsole,
  print as consolePrint,
  setPrompt as consoleSetPrompt,
  setStatus as consoleSetStatus,
  bindHotkeys as consoleBindHotkeys
} from '/static/src/console/consoleUI.js';
import { parse } from '/static/src/console/parse.js';
import { dispatch } from '/static/src/console/dispatch.js';

// ==== GLOBAL/ENV ====
const QS = new URLSearchParams(location.search);
const DEV_MODE = QS.has('devmode');

// Simple user token persistence for autosave/demo
const USER_TOKEN = (() => {
  const key = 'mvp3_user_token';
  const fromQS = QS.get('token');
  if (fromQS) {
    localStorage.setItem(key, fromQS);
    return fromQS;
  }
  let v = localStorage.getItem(key);
  if (!v) {
    v = crypto.getRandomValues(new Uint32Array(4)).join('-');
    localStorage.setItem(key, v);
  }
  return v;
})();

// ==== DOM HOOKS ====
const overlayMapEl = document.getElementById('overlayMap');
const btnWorldMap   = document.getElementById('btnWorldMap');
const overlayChar   = document.getElementById('overlayCharacter');
const overlayInv    = document.getElementById('overlayInventory');

const btnCharacter  = document.getElementById('btnCharacter');
const btnInventory  = document.getElementById('btnInventory');

const shardSelect   = document.getElementById('shardSelect');
const btnLoadShard  = document.getElementById('btnLoadShard');
const shardStatus   = document.getElementById('shardStatus');

const roomTitle = document.getElementById('roomTitle');
const roomBiome = document.getElementById('roomBiome');
const roomArt   = document.getElementById('roomArt');

const statHP     = document.getElementById('statHP');
const statMP     = document.getElementById('statMP');
const statSTA    = document.getElementById('statSTA');
const statHunger = document.getElementById('statHunger');

// ==== CONSOLE V2 MOUNT & WIRING ====
const consoleRoot = document.getElementById('console-root');

// normalize server response → Frame[]
async function apiExec(line, context = {}) {
  try {
    const res = await fetch('/api/console/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line, context })
    });

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch {}
      return [{ type: 'text', data: `API error ${res.status}${text ? `: ${text}` : ''}` }];
    }
    const json = await res.json().catch(() => null);

    if (json && Array.isArray(json.frames)) return json.frames;
    if (json && json.type && json.data) return [json];
    return [{ type: 'text', data: 'Unexpected server response.' }];
  } catch (err) {
    return [{ type: 'text', data: `Network error: ${err?.message || String(err)}` }];
  }
}

const __consoleUI = mountConsole(consoleRoot, {
  onSubmit: async (line, ctx = {}) => {
    const parsed = parse(line);
    if (parsed?.error) {
      return [{ type: 'text', data: `Error: ${parsed.error.message}` }];
    }
    const frames = await dispatch(
      { line, ...parsed, context: ctx },
      { rpcExec: ({ line: single }) => apiExec(single, ctx) }
    );
    return Array.isArray(frames) ? frames : [{ type: 'text', data: 'No output.' }];
  }
});
consoleBindHotkeys();

// Optional helpers for quick debugging via DevTools
window.consolePrint      = consolePrint;
window.consoleSetPrompt  = consoleSetPrompt;
window.consoleSetStatus  = consoleSetStatus;
window.__consoleV2 = { apiExec, parse, dispatch, ui: __consoleUI };

// ==== SMALL UTILITIES ====
const clampPct = (v) => Math.max(0, Math.min(100, v));
const toggle = (el, force) => {
  if (!el) return;
  const show = (typeof force === 'boolean') ? force : el.classList.contains('hidden');
  el.classList.toggle('hidden', !show);
};
const isTyping = (t) => {
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const disallowed = ['checkbox', 'radio', 'button', 'range', 'submit', 'reset', 'file', 'color'];
    return !disallowed.includes((t.type || '').toLowerCase());
  }
  return t.isContentEditable === true;
};

// ---- ART RESOLUTION HELPERS (for game card — unchanged behavior) ----
async function headOk(url) { try { const r=await fetch(url,{method:'HEAD'}); return r.ok; } catch { return false; } }
function makeArtCandidates(room) {
  const biome = (room.biome || '').toLowerCase();
  const poi   = (room.poi?.type || room.town?.type || room.tags?.find(t => /town|city|village|port|dungeon/i.test(t)) || '').toString().toLowerCase();
  const roots = ['/static/assets/rooms','/static/assets/biomes','/static/assets/2d/rooms','/static/assets/2d/biomes'];
  const names = [];
  if (poi) names.push(`poi_${poi}.png`, `town_${poi}.png`, `${poi}.png`);
  if (biome) names.push(`biome_${biome}.png`, `${biome}.png`);
  names.push('default_room.png','unknown.png');
  const out=[]; for(const root of roots) for(const n of names) out.push(`${root}/${n}`); return out;
}
async function resolveArtSrc(room) {
  if (room.artSrc) return room.artSrc;
  for (const url of makeArtCandidates(room)) { if (await headOk(url)) return url; }
  return '';
}

// ==== CHARACTER HUD ====
function updateCharHud(p = {}) {
  if (statHP && Number.isFinite(p.hp) && Number.isFinite(p.max_hp)) statHP.style.width = clampPct((p.hp / p.max_hp) * 100) + '%';
  if (statMP && Number.isFinite(p.mp) && Number.isFinite(p.max_mp)) statMP.style.width = clampPct((p.mp / p.max_mp) * 100) + '%';
  if (statSTA && Number.isFinite(p.sta) && Number.isFinite(p.max_sta)) statSTA.style.width = clampPct((p.sta / p.max_sta) * 100) + '%';
  if (statHunger && Number.isFinite(p.hunger)) statHunger.style.width = clampPct(p.hunger) + '%';
}

// ==== ROOM RENDER ====
function renderRoomInfo(room, opts = { flavor: true }) {
  if (!room) return;
  if (roomTitle) roomTitle.textContent = room.title || `(${room.x},${room.y})`;
  if (roomBiome) roomBiome.textContent = room.biome || '';
  const applyArt = (src) => {
    if (!roomArt) return;
    if (roomArt.tagName === 'IMG') { roomArt.removeAttribute('src'); if (src) roomArt.src = src; roomArt.alt = room.title || 'room art'; }
    else { roomArt.style.backgroundImage = src ? `url("${src}")` : ''; roomArt.title = room.title || ''; roomArt.setAttribute('aria-hidden', src ? 'false' : 'true'); }
  };
  if (room.artSrc) applyArt(room.artSrc);
  else resolveArtSrc(room).then(applyArt);
  if (opts.flavor && room.flavor) log(room.flavor, 'log-flavor');
}

// ==== LIGHTWEIGHT LOG MIRROR → CONSOLE ====
const _log = [];
function log(text, cls, ts) {
  const stamp = new Date(ts || Date.now()).toLocaleTimeString();
  const line = `[${stamp}] ${text}`;
  _log.push({ text: line, cls });
  if (_log.length > 300) _log.shift();
  consolePrint(line, { mode: cls ? 'system' : 'normal' });
}

// ==== OVERLAY MAP INSTANCE ====
const overlay = initOverlayMap?.({ devMode: DEV_MODE });
const openMap   = () => { overlayMapEl?.classList.remove('hidden'); overlay?.render?.(); };
const closeMap  = () => overlayMapEl?.classList.add('hidden');
const toggleMap = () => overlayMapEl?.classList.contains('hidden') ? openMap() : closeMap();

// ==== GAME STATE ====
let CurrentPos = { x: 0, y: 0 };
window.currentRoom = null;

// Accept room delta payloads from server and re-render
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

// Position changes (e.g., from combat/movement server events)
window.addEventListener('game:position', (ev) => {
  const d = ev.detail || {};
  CurrentPos.x = d.x ?? CurrentPos.x;
  CurrentPos.y = d.y ?? CurrentPos.y;
  const room = buildRoom(CurrentPos.x, CurrentPos.y);
  renderRoomInfo(room);
  overlay?.setPos?.(d.x, d.y);
  overlay?.render?.();
});

// Pipe generic log events into console
window.addEventListener('game:log', (ev) => {
  const events = ev.detail || [];
  for (const e of events) {
    const cls = e.type && e.type !== 'log' ? `log-${e.type}` : '';
    log(e.text || String(e), cls, e.ts);
  }
});

// ==== KEYBOARD SHORTCUTS (overlays only; console uses its own hotkeys) ====
window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  const k = e.key?.toLowerCase?.();
  if (k === 'm') { e.preventDefault(); toggleMap(); }
  if (k === 'c') { e.preventDefault(); toggle(overlayChar); }
  if (k === 'i') { e.preventDefault(); toggle(overlayInv); }
  if (k === 'escape') { e.preventDefault(); closeMap(); overlayChar?.classList.add('hidden'); overlayInv?.classList.add('hidden'); }
});

// ==== SHARD LOADING FLOW ====

function normalizeShardList(items) {
  const out = [];
  if (!Array.isArray(items)) return out;
  for (const it of items) {
    if (typeof it === 'string') {
      const s = it.trim();
      if (s) out.push({ name: s.replace(/^.*\//, ''), url: s });
    } else if (it && typeof it === 'object') {
      const url = typeof it.url === 'string' ? it.url.trim() : '';
      if (!url) continue;
      const name = it.name ? it.name.trim() : url.replace(/^.*\//, '');
      out.push({ name, url });
    }
  }
  return out;
}

async function loadAvailableShards() {
  try {
    if (shardStatus) shardStatus.textContent = 'Loading…';
    const res = await fetch('/api/shards');
    const json = await res.json().catch(() => ({}));
    const list = normalizeShardList(json?.items || json || []);
    if (shardSelect) {
      shardSelect.innerHTML = '';
      for (const s of list) {
        const opt = document.createElement('option');
        opt.value = s.url; opt.textContent = s.name; shardSelect.appendChild(opt);
      }
      const demo = '/static/public/shards/00089451_test123.json';
      if (![...shardSelect.options].some(o => o.value === demo)) {
        const o = document.createElement('option'); o.value = demo; o.textContent = '00089451_test123.json'; shardSelect.appendChild(o);
      }
      shardSelect.value = demo;
    }
    if (shardStatus) shardStatus.textContent = 'Ready';
  } catch (e) {
    console.error(e);
    if (shardStatus) shardStatus.textContent = 'Error';
  }
}

// SAFE shard loader
async function loadShard(url) {
  if (!url) return;
  if (shardStatus) shardStatus.textContent = 'Loading…';
  try {
    const res = await fetch(url);
    const shard = await res.json();

    if (!Array.isArray(shard?.tiles) || !Array.isArray(shard.tiles[0])) {
      console.error('[mvp3] Bad shard shape:', shard && Object.keys(shard));
      throw new Error('Shard tiles must be a 2D array');
    }
    assertCanonicalTiles(shard.tiles);
    setRoomShard(shard);

    const summary = summarizeBiomes(shard.tiles);
    console.log('Biome summary', summary);
    if ((summary.unknown || 0) > 0) {
      consolePrint(`{yellow}Warning{/}: Unknown biome tokens encountered (unknown=${summary.unknown})`, { mode: 'system' });
    }

    CurrentPos = { x: 12, y: 15 };

    const room = buildRoom(CurrentPos.x, CurrentPos.y);
    window.currentRoom = room;
    renderRoomInfo(room, { flavor: true });

    // Normalize biome tokens for the overlay → image keys
    const overlayTiles = shard.tiles.map(row => row.map(t => {
      const raw = (t && typeof t === 'object') ? (t.biome || t.type || t.terrain || 'unknown') : String(t || 'unknown');
      const b = raw.toLowerCase();
      if (b === 'water' || b === 'ocean') return 'ocean';
      if (b === 'coast' || b === 'beach') return 'plains';   // show sand as plains tile image for now
      if (b === 'grass' || b === 'plain' || b === 'plains') return 'plains';
      if (b === 'forest' || b === 'woods') return 'forest';
      if (b === 'swamp') return 'marsh';                     // not in atlas → will fall back to default
      return b;                                              // others will fall back to default image
    }));
    const overlayShard = { ...shard, tiles: overlayTiles };
    overlay?.setShard?.(overlayShard);
    overlay?.setPos?.(CurrentPos.x, CurrentPos.y);
    overlay?.render?.();

    document.dispatchEvent(new CustomEvent('game:log', {
      detail: [{ text: `Shard loaded. Spawn at (${CurrentPos.x},${CurrentPos.y})`, ts: Date.now() }]
    }));

    window.__lastShard = shard;
    if (shardStatus) shardStatus.textContent = 'Loaded';
  } catch (e) {
    console.error(e);
    if (shardStatus) shardStatus.textContent = 'Error';
    consolePrint(`{red}Failed to load shard{/}: ${e?.message || e}`, { mode: 'system' });
  }
}

// ==== UI WIRES ====
btnLoadShard?.addEventListener('click', async () => {
  const url = shardSelect?.value;
  if (!url) return;
  await loadShard(url);
});
shardSelect?.addEventListener('change', () => btnLoadShard?.click());
btnWorldMap?.addEventListener('click', () => toggleMap());
btnCharacter?.addEventListener('click', () => toggle(overlayChar));
btnInventory?.addEventListener('click', () => toggle(overlayInv));

overlayChar?.querySelector('[data-close="char"]')
  ?.addEventListener('click', () => overlayChar.classList.add('hidden'));
overlayInv?.querySelector('[data-close="inv"]')
  ?.addEventListener('click', () => overlayInv.classList.add('hidden'));

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const overlay = target.closest('.overlay');
  if (!overlay) return;
  const panel = target.closest('.panel');
  if (!panel) overlay.classList.add('hidden');
});

// ==== BOOTSTRAP ====
document.addEventListener('DOMContentLoaded', async () => {
  // Load item catalog for tooltips/inventory
  try {
    const res = await fetch('/static/public/api/catalog.json', { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      window.__itemCatalog = await res.json();
      window.dispatchEvent(new CustomEvent('catalog:loaded', { detail: { count: Array.isArray(window.__itemCatalog) ? window.__itemCatalog.length : 0 } }));
    }
  } catch {}
  await loadAvailableShards();
  if (shardSelect?.value) { try { await loadShard(shardSelect.value); } catch {} }
});

// ==== AUTOSAVE TICK ====
let _autosaveTimer = null;
function startAutosave() {
  clearInterval(_autosaveTimer);
  _autosaveTimer = setInterval(async () => {
    try { const state = { pos: CurrentPos, token: USER_TOKEN, ts: Date.now() }; await autosaveCharacterState(state); }
    catch { /* no-op */ }
  }, 15000);
}
startAutosave();

// ==== INVENTORY PANEL QUICK DEMO ====
document.addEventListener('DOMContentLoaded', () => {
  const characterId = window.SHARDBOUND?.characterId || 'demo-character-id';
  const mount = document.getElementById('inventory-root');
  if (mount) initInventoryPanel({ characterId, mountEl: mount });
  document.getElementById('btn-add-potion')?.addEventListener('click', () => { addInvItem(characterId, 'health-potion', 1); });
  document.getElementById('btn-remove-potion')?.addEventListener('click', () => { removeInvItem(characterId, 'health-potion', 1); });
});
