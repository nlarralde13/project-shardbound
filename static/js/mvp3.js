// MVP3 Orchestrator — gameplay shell + shard loader + overlay wiring
// Keeps keyboard handling in movementController; rules in movementRules.
// Overlay map shows full board, token, roads/POIs; devmode supports ?noclip.
import { poiClassFor, canonicalSettlement } from '/static/js/settlementRegistry.js';
import { rollRoomEvent } from '/static/js/eventTables.js';
import { initOverlayMap } from '/static/js/overlayMap.js';
import { ALL_BIOME_KEYS, randomTitleFor, BIOMES, BIOME_COLORS, canonicalBiome } from '/static/js/biomeRegistry.js';

import { createMovementController } from '/static/js/movement/movementController.js';
import { createMovementRules } from '/static/js/movement/movementRules.js';

(async function () {
  // --- flags & token ---------------------------------------------------------
  const QS = new URLSearchParams(location.search);
  const DEV_MODE = QS.has('devmode');
  const NOCLIP   = DEV_MODE && QS.has('noclip');

  const USER_TOKEN = (() => {
    const k = 'mvp3_user_token';
    const q = QS.get('token');
    if (q) { localStorage.setItem(k, q); return q; }
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.getRandomValues(new Uint32Array(4)).join('-');
      localStorage.setItem(k, v);
    }
    return v;
  })();

  // --- DOM -------------------------------------------------------------------
  const consoleEl    = document.getElementById('console');
  const btnWorldMap  = document.getElementById('btnWorldMap');
  const btnCharacter = document.getElementById('btnCharacter');
  const btnInventory = document.getElementById('btnInventory');
  const overlayMapEl = document.getElementById('overlayMap');
  const overlayChar  = document.getElementById('overlayChar');
  const overlayInv   = document.getElementById('overlayInv');
  const shardSelect  = document.getElementById('shardSelect');
  const btnLoadShard = document.getElementById('btnLoadShard');
  const shardStatus  = document.getElementById('shardStatus');
  const roomTitle    = document.getElementById('roomTitle');
  const roomBiome    = document.getElementById('roomBiome');
  const roomArt      = document.getElementById('roomArt');

  // --- state -----------------------------------------------------------------
  let shard = null;
  let rules = null;
  const actor = { hp: 20, mp: 10, sta: 12, boat: false, canClimb: false };
  const pos   = { x: 12, y: 15, biome: 'Forest', title: 'Shadowed Grove' }; // default spawn

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const ALLOWED_BIOMES = new Set(ALL_BIOME_KEYS);
  let warnedNonCanonical = false;

  // --- overlay ---------------------------------------------------------------
  const overlay = initOverlayMap({
    devMode: DEV_MODE,
    getBiomeColor: (k) => BIOME_COLORS[(canonicalBiome?.(k) ?? k)] || '#a0a0a0',
    getPoiClass:    (t) => poiClassFor?.(t) || 'poi',
  });

  // --- console helpers -------------------------------------------------------
  function log(text, cls = '') {
    if (!consoleEl) return;
    const line = document.createElement('div');
    line.className = 'line ' + (cls || '');
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    if (consoleEl.children.length > 220) consoleEl.removeChild(consoleEl.firstChild);
  }
  function logLines(arr) { (arr || []).forEach(s => log(s, s?.toLowerCase().includes('warn') ? 'log-warn' : 'log-note')); }
  function setShardStatus(msg, kind = 'info') {
    if (!shardStatus) return;
    const color = kind === 'error' ? '#e57373' : kind === 'warn' ? '#ffb74d' : '#9e9e9e';
    shardStatus.textContent = msg || '';
    shardStatus.style.color = color;
  }
  function assertCanonicalGrid(grid) {
    if (warnedNonCanonical) return;
    const bad = new Set();
    for (let y = 0; y < grid.length; y++)
      for (let x = 0; x < grid[0].length; x++)
        if (!ALLOWED_BIOMES.has(grid[y][x])) bad.add(grid[y][x]);
    if (bad.size) { warnedNonCanonical = true; console.warn('[Shard] Non-canonical biomes:', [...bad]); }
  }
  function biomeAt(x, y) {
    if (!shard) return 'Forest';
    const [W, H] = shard.size || [0, 0];
    if (x < 0 || y < 0 || x >= W || y >= H) return 'Coast';
    return shard.grid?.[y]?.[x] ?? 'Coast';
  }

  function applyArt(biomeKey) {
    const b = BIOMES[biomeKey] || BIOMES.Forest;
    roomArt.style.backgroundImage = b.tint;
    roomArt.style.backgroundColor = 'transparent';
    if (b.art) {
      roomArt.style.backgroundImage = `${b.tint}, url("${b.art}")`;
      roomArt.style.backgroundSize = 'cover, contain';
      roomArt.style.backgroundPosition = 'center, center';
      roomArt.style.backgroundRepeat = 'no-repeat, no-repeat';
    } else {
      roomArt.style.backgroundSize = 'cover';
      roomArt.style.backgroundPosition = 'center';
      roomArt.style.backgroundRepeat = 'no-repeat';
    }
  }
  function describe(b) { return {
    Forest: 'Tall trunks crowd the path; spores drift like dust in a sunbeam.',
    Plains: 'Grass bows to a steady wind. The horizon feels endless.',
    Coast: 'Gulls cry over slate water; salt stings your lips.',
    'marsh-lite': 'Wet ground sucks at your boots; frogs trill unseen.',
    Hills: 'Ridges roll like sleeping beasts beneath the sod.',
    Mountains: 'Jagged stone juts toward a pale sky.',
    Volcano: 'Ash crunches underfoot. The air tastes of metal.',
    Tundra: 'Cold bites the lungs; the world speaks in pale whispers.',
  }[b] || 'You stand at a crossroads of the unknown.'; }
  function setRoom(next) {
    const b = next.biome;
    roomTitle.textContent = next.title || 'Unknown Place';
    roomBiome.textContent = b;
    applyArt(b);
    log(describe(b), 'log-note');
  }
  function refreshBars() {
    const hpI = document.querySelector('.bar.hp i');
    const mpI = document.querySelector('.bar.mp i');
    const staI = document.querySelector('.bar.sta i');
    if (hpI) hpI.style.width = Math.max(0, Math.min(100, actor.hp / 20 * 100)) + '%';
    if (mpI) mpI.style.width = Math.max(0, Math.min(100, actor.mp / 10 * 100)) + '%';
    if (staI) staI.style.width = Math.max(0, Math.min(100, actor.sta / 12 * 100)) + '%';
  }
  const siteAt = (x, y) => shard?.sites?.find(s => (s.pos?.[0] ?? s.x) === x && (s.pos?.[1] ?? s.y) === y) || null;

  // --- movement plumbing -----------------------------------------------------
  function afterMoveEffects() {
    overlay.setPos(pos.x, pos.y);
    const here = siteAt(pos.x, pos.y);
    if (here) log(`You see ${canonicalSettlement(here.type)} — ${here.name || canonicalSettlement(here.type)}.`, 'log-warn');
  }
  async function tryMove(dir) {
    if (!shard?.size) return false;
    const res = rules.evaluateStep(actor, pos, dir, { devMode: DEV_MODE, noclip: NOCLIP });
    if (!res.ok) { if (res.reason) log(res.reason, 'log-note'); return false; }

    // costs
    if (res.costs?.sta) {
      actor.sta = Math.max(0, actor.sta - res.costs.sta);
      refreshBars();
      if (res.costs.sta >= 2) log('That terrain slows you down.', 'log-note');
    }

    // commit
    pos.x = res.to.x; pos.y = res.to.y;
    pos.biome = res.to.biome || biomeAt(pos.x, pos.y);
    pos.title = randomTitleFor(pos.biome);
    setRoom({ title: pos.title, biome: pos.biome });
    log(`You move ${dir}. (${pos.x},${pos.y}) • ${pos.title} • ${pos.biome}`, 'log-note');
    afterMoveEffects();
    return true;
  }

  // Optional: server-side move (kept here but unused in the local rules path)
  async function move(dx, dy) {
    const res = await fetch('/api/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dx, dy })
    }).then(r => r.json());
    if (res.ok) {
      const { x, y } = res.pos;
      overlay.setPos(x, y); overlay.render();
      logLines(res.log);
    } else {
      logLines([`Can't move: ${res.reason}`]);
    }
  }

  function tryInteract() {
    const here = siteAt(pos.x, pos.y);
    if (!here) { log('Nothing obvious to enter here.', 'log-note'); return; }
    const label = canonicalSettlement(here.type);
    log(`You enter ${label}.`, 'log-ok');
  }

  function tryRest() {
    const heal = 2;
    actor.hp = Math.min(20, actor.hp + heal);
    actor.sta = Math.min(12, actor.sta + 2);
    refreshBars();
    log(`You rest. (+${heal} HP, +2 STA)`, 'log-ok');
  }

  // click UI still supported
  document.querySelectorAll('[data-qa]').forEach(b => {
    b.addEventListener('click', () => {
      const qa = b.dataset.qa;
      if (qa.startsWith('move')) tryMove(qa.slice(-1).toUpperCase());
      else if (qa === 'search')  log('You search carefully…', 'log-note');
      else if (qa === 'harvest') log('There is nothing obvious to harvest here.', 'log-note');
      else if (qa === 'rest')    tryRest();
      else if (qa === 'enter')   tryInteract();
      else if (qa === 'help')    log('Try: Move N/E/S/W, Search, Harvest, Rest (R), Enter, Map (M).', 'log-note');
    });
  });

  // Overlay toggling
  function toggle(el, show) {
    const forceClose = show === false;
    el.classList.toggle('hidden', forceClose ? true : el.classList.contains('hidden') ? false : true);
    if (el === overlayMapEl && !el.classList.contains('hidden')) {
      document.getElementById('mapUserToken')?.replaceChildren(document.createTextNode(`Token: ${USER_TOKEN}`));
      overlay._syncToggles?.();
      overlay.setDev(DEV_MODE);
      overlay.setToken(USER_TOKEN);
      overlay.setFullBoard(true);
      overlay.setPos(pos.x, pos.y);
      overlay.render();
    }
  }

  // Keyboard controller (arrow/WASD + hotkeys)
  const controller = createMovementController({
    devMode: DEV_MODE,
    noclip: NOCLIP,
    tryMove,
    tryInteract,
    tryRest,
    onHotkey: {
      map:   () => toggle(overlayMapEl),
      char:  () => toggle(overlayChar),
      inv:   () => toggle(overlayInv),
      escape:() => { toggle(overlayMapEl, false); toggle(overlayChar, false); toggle(overlayInv, false); },
    },
    allowDiagonals: false,
  });
  controller.attachToWindow();

  // ---- shard loader ----------------------------------------------------------
  async function fetchShardList() {
    try { const r = await fetch('/api/shards'); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    catch { return null; }
  }
  function labelForItem(it) {
    const disp = it?.meta?.displayName || it?.meta?.name;
    return disp ? `${disp} (${it.file})` : it.file;
  }
  async function populateShardPicker(items) {
    if (!shardSelect) return;
    if (!Array.isArray(items) || !items.length) return;
    const seen = new Set(Array.from(shardSelect.options).map(o => o.value));
    items.forEach(it => {
      if (seen.has(it.path)) return;
      const opt = document.createElement('option');
      opt.value = it.path; opt.dataset.name = it.file; opt.textContent = labelForItem(it);
      shardSelect.appendChild(opt);
    });
  }
  function assertAndNormalize(data) {
    let grid = data.grid;
    if (!grid && Array.isArray(data.tiles))
      grid = data.tiles.map(row => row.map(cell => (typeof cell === 'string' ? cell : cell?.biome)));
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) throw new Error('Invalid shard: grid missing or malformed');
    const W = (Array.isArray(data.size) && data.size[0]) || data?.meta?.width  || grid[0].length;
    const H = (Array.isArray(data.size) && data.size[1]) || data?.meta?.height || grid.length;
    const sites = data.sites || (Array.isArray(data.pois) ? data.pois.map(p => ({ name: p.name, type: p.type, pos: p.pos ? p.pos.slice() : [p.x, p.y], meta: p.meta })) : []);
    assertCanonicalGrid(grid);
    return { ...data, grid, size: [Number(W), Number(H)], sites };
  }
  async function loadShard(url) {
    setShardStatus('Loading…', 'info');
    const res = await fetch(url);
    if (!res.ok) { setShardStatus('Failed to load shard.', 'error'); throw new Error(`HTTP ${res.status} for ${url}`); }
    const data = await res.json();
    shard = assertAndNormalize(data);

    // rebuild movement rules for this shard
    rules = createMovementRules(shard);

    const [W, H] = shard.size;
    if (Array.isArray(shard.spawn)) {
      pos.x = clamp(shard.spawn[0], 0, W - 1);
      pos.y = clamp(shard.spawn[1], 0, H - 1);
    } else {
      pos.x = clamp(pos.x, 0, W - 1);
      pos.y = clamp(pos.y, 0, H - 1);
    }
    pos.biome = biomeAt(pos.x, pos.y);
    pos.title = randomTitleFor(pos.biome);
    setRoom({ title: pos.title, biome: pos.biome });
    refreshBars();

    overlay.setShard(shard);
    overlay.setPos(pos.x, pos.y);

    setShardStatus('Loaded.', 'info');
    log('Shard loaded: ' + (shard.name || shard?.meta?.displayName || 'Unnamed Shard'), 'log-note');

    if (shardSelect && url) {
      for (const o of shardSelect.options) { if (o.value === url) { o.selected = true; break; } }
    }
  }

  btnLoadShard?.addEventListener('click', async () => {
    const url = shardSelect?.value; if (!url) return;
    try { await loadShard(url); } catch (e) { console.warn(e); setShardStatus('Load failed', 'error'); }
  });
  shardSelect?.addEventListener('change', () => btnLoadShard?.click());

  // overlay buttons
  btnWorldMap?.addEventListener('click', () => toggle(overlayMapEl));
  btnCharacter?.addEventListener('click', () => toggle(overlayChar));
  btnInventory?.addEventListener('click', () => toggle(overlayInv));
  document.querySelectorAll('[data-close="map"]').forEach(el => el.addEventListener('click', () => toggle(overlayMapEl, false)));
  document.querySelectorAll('[data-close="char"]').forEach(el => el.addEventListener('click', () => toggle(overlayChar, false)));
  document.querySelectorAll('[data-close="inv"]').forEach(el => el.addEventListener('click', () => toggle(overlayInv, false)));

  // ---- server spawn (sets same 12,15 default) --------------------------------
  try {
    await fetch('/api/world'); // touch
    const spawn = await fetch('/api/spawn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 12, y: 15 })
    }).then(r => r.json());
    const { x, y } = (spawn.player && spawn.player.pos) || { x: 12, y: 15 };
    overlay.setPos(x, y);
    overlay.setToken(spawn.player?.id || USER_TOKEN);
  } catch {}

  // ---- boot ------------------------------------------------------------------
  try {
    const items = await fetchShardList();
    await populateShardPicker(items || []);
    const current = shardSelect?.value
      || document.getElementById('starterShardOption')?.value
      || '/static/public/shards/00089451_test123.json';
    await loadShard(current);
    document.getElementById('mapUserToken')?.replaceChildren(document.createTextNode(`Token: ${USER_TOKEN}`));
  } catch (e) {
    console.warn('Auto-load failed:', e);
    setShardStatus('Please select a shard to load.', 'warn');
  }
})();
