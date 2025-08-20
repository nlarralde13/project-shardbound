// MVP2 — room-first controller, JSON shard loader, biome-colored mini-map,
// POI overlay (windowed), edge-clamped movement, inventory stub.
//
// Requires canonical biome/settlement keys from your master registries.

import { BIOMES, BIOME_COLORS, ALL_BIOME_KEYS, randomTitleFor } from './biomeRegistry.js';
import { rollRoomEvent } from './eventTables.js';
import { poiClassFor, canonicalSettlement } from './settlementRegistry.js';

(function () {
  // ===== DOM refs =====
  const consoleEl    = document.getElementById('console');
  const cmdInput     = document.getElementById('cmd');
  const cmdSend      = document.getElementById('cmdSend');
  const btnWorldMap  = document.getElementById('btnWorldMap');
  const btnCharacter = document.getElementById('btnCharacter');
  const btnInventory = document.getElementById('btnInventory');

  const overlayMap   = document.getElementById('overlayMap');
  const overlayChar  = document.getElementById('overlayChar');
  const overlayInv   = document.getElementById('overlayInv');

  const roomTitle    = document.getElementById('roomTitle');
  const roomBiome    = document.getElementById('roomBiome');
  const roomArt      = document.getElementById('roomArt');

  const miniGridEl   = document.getElementById('miniGrid');
  const mapPOI       = document.getElementById('mapPOI');
  const invList      = document.getElementById('invList');

  // Optional shard picker controls (safe to be absent)
  const shardSelect  = document.getElementById('shardSelect');
  const btnLoadShard = document.getElementById('btnLoadShard');
  const shardStatus  = document.getElementById('shardStatus');

  // ===== Shard data & helpers =====
  let shard = null;
  const colorForBiome = (b) => BIOME_COLORS[b] || '#a0a0a0';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const ALLOWED_BIOMES = new Set(ALL_BIOME_KEYS);
  let warnedNonCanonical = false;

  function setShardStatus(msg, kind = 'info') {
    if (!shardStatus) return;
    const color = kind === 'error' ? '#e57373' : kind === 'warn' ? '#ffb74d' : '#9e9e9e';
    shardStatus.textContent = msg || '';
    shardStatus.style.color = color;
  }

  function assertCanonicalGrid(grid) {
    if (warnedNonCanonical) return;
    const bad = new Set();
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (!ALLOWED_BIOMES.has(grid[y][x])) bad.add(grid[y][x]);
      }
    }
    if (bad.size) {
      warnedNonCanonical = true;
      console.warn('[Shard] Non-canonical biomes found:', [...bad]);
    }
  }

  function biomeAt(x, y) {
    if (!shard) return 'Forest';
    const [W, H] = shard.size || [0, 0];
    if (x < 0 || y < 0 || x >= W || y >= H) return 'Coast';
    if (!Array.isArray(shard.grid) || !Array.isArray(shard.grid[0])) return 'Coast';
    return shard.grid[y]?.[x] ?? 'Coast';               // assumes canonical keys
  }

  function siteAt(x, y) {
    if (!Array.isArray(shard?.sites)) return null;
    return shard.sites.find(s => s.pos?.[0] === x && s.pos?.[1] === y) || null;
  }

  // ===== Console log =====
  function log(text, cls = '') {
    if (!consoleEl) return;
    const line = document.createElement('div');
    line.className = 'line ' + (cls || '');
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    if (consoleEl.children.length > 220) consoleEl.removeChild(consoleEl.firstChild);
  }

  // ===== Room visuals =====
  function applyArt(biomeKey) {
    const b = BIOMES[biomeKey] || BIOMES.Forest;
    // Use gradient as the primary background (always visible)
    roomArt.style.backgroundImage = b.tint;              // linear-gradient(...)
    roomArt.style.backgroundColor = 'transparent';
    if (b.art) {
      // If you later add art URLs, layer them atop the gradient
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

  function describe(biomeKey) {
    return {
      Forest: 'Tall trunks crowd the path; spores drift like dust in a sunbeam.',
      Plains: 'Grass bows to a steady wind. The horizon feels endless.',
      Coast: 'Gulls cry over slate water; salt stings your lips.',
      DesertSand: 'Heat wriggles above the dunes. Footprints vanish behind you.',
      Volcano: 'Ash crunches underfoot. The air tastes of metal.',
      Tundra: 'Cold bites the lungs; the world speaks in pale whispers.'
    }[biomeKey] || 'You stand at a crossroads of the unknown.';
  }

  function setRoom(next) {
    const b = next.biome;
    roomTitle.textContent = next.title || 'Unknown Place';
    roomBiome.textContent = b;
    applyArt(b);
    log(describe(b), 'log-note');
  }

  // ===== Mini-map window (overlay) =====
  // Always show a 16×16 window centered on the player (clamped to edges)
  const GRID_W = 16, GRID_H = 16;

  function getViewWindow() {
    const [W, H] = shard?.size || [GRID_W, GRID_H];
    const vw = Math.min(GRID_W, W);
    const vh = Math.min(GRID_H, H);
    let vx = Math.max(0, Math.min(W - vw, pos.x - Math.floor(vw / 2)));
    let vy = Math.max(0, Math.min(H - vh, pos.y - Math.floor(vh / 2)));
    return { vx, vy, vw, vh, W, H };
  }

  let lastHere = null;

  function renderMiniGrid() {
    if (!miniGridEl || !shard) return;

    const { vx, vy, vw, vh } = getViewWindow();

    miniGridEl.innerHTML = '';
    miniGridEl.style.display = 'grid';
    miniGridEl.style.gridTemplateColumns = `repeat(${vw}, 1fr)`;

    for (let y = vy; y < vy + vh; y++) {
      for (let x = vx; x < vx + vw; x++) {
        const biome = biomeAt(x, y);
        const d = document.createElement('div');
        d.className = 'cell';
        d.style.background = colorForBiome(biome);       // solid fill from registry
        d.style.outline = '1px solid rgba(0,0,0,0.06)';  // subtle grid
        d.title = `${biome} (${x},${y})`;
        d.dataset.x = x; d.dataset.y = y;                // world coords
        miniGridEl.appendChild(d);
      }
    }
    updateMiniHere(pos.x, pos.y);
  }

  function updateMiniHere(px, py) {
    if (!miniGridEl || !shard) return;
    const { vx, vy, vw, vh } = getViewWindow();

    const lx = px - vx, ly = py - vy;
    if (lastHere) lastHere.classList.remove('here');
    if (lx < 0 || ly < 0 || lx >= vw || ly >= vh) { lastHere = null; return; }

    const idx = ly * vw + lx;
    const cell = miniGridEl.children[idx];
    if (cell) { cell.classList.add('here'); lastHere = cell; }
  }

  function renderPOI() {
    if (!shard || !miniGridEl || !mapPOI) return;

    const boxW = miniGridEl.clientWidth;
    const boxH = miniGridEl.clientHeight;
    if (!boxW || !boxH) { requestAnimationFrame(renderPOI); return; }

    const parent = miniGridEl.parentElement;
    if (parent) {
      const st = getComputedStyle(parent);
      if (st.position === 'static') parent.style.position = 'relative';
      mapPOI.style.position = 'absolute';
      mapPOI.style.left = miniGridEl.offsetLeft + 'px';
      mapPOI.style.top  = miniGridEl.offsetTop  + 'px';
      mapPOI.style.width  = boxW + 'px';
      mapPOI.style.height = boxH + 'px';
      mapPOI.style.pointerEvents = 'none';
      mapPOI.style.zIndex = 2;
    }

    const { vx, vy, vw, vh } = getViewWindow();
    const cellW = boxW / vw;
    const cellH = boxH / vh;

    mapPOI.innerHTML = '';
    (shard.sites || []).forEach(s => {
      const [x, y] = s.pos || [0, 0];
      if (x < vx || y < vy || x >= vx + vw || y >= vy + vh) return;

      const el = document.createElement('div');
      el.className = poiClassFor(s.type);

      // Settlements adopt local biome color
      if (canonicalSettlement(s.type) === 'Settlement') {
        el.style.background = colorForBiome(biomeAt(x, y));
      }

      const lx = x - vx, ly = y - vy;
      el.style.position = 'absolute';
      el.style.left = `${lx * cellW + (cellW / 2) - 7}px`;
      el.style.top  = `${ly * cellH + (cellH / 2) - 7}px`;
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.title = `${s.name} (${canonicalSettlement(s.type)})`;

      mapPOI.appendChild(el);
    });
  }

  // ===== Events on entering rooms =====
  const lastSeen = { resource: null, hotspot: null };

  function onEnterRoom(biomeKey) {
    const ev = rollRoomEvent(biomeKey);

    if (ev.type === 'empty') { log('The room is quiet.', 'log-note'); return; }
    if (ev.type === 'resource') {
      const { node, qty } = ev;
      log(`You spot a resource: ${node.name} ×${qty}.`, 'log-ok');
      log(`Try “harvest” to gather.`, 'log-note');
      lastSeen.resource = { node, qty }; return;
    }
    if (ev.type === 'hazard') {
      const { hazard, dmg } = ev;
      actor.hp = Math.max(0, actor.hp - dmg);
      log(`Hazard! ${hazard.name} (-${dmg} HP)`, 'log-bad');
      refreshBars(); return;
    }
    if (ev.type === 'hotspot') {
      log(`A hotspot is here: ${ev.hotspot.name}.`, 'log-warn');
      log(`Use “enter” to investigate.`, 'log-note');
      lastSeen.hotspot = ev.hotspot;
    }
  }

  // ===== Character & HUD =====
  const actor = { hp: 20, mp: 10, sta: 12 };
  let pos = { x: 12, y: 7, biome: 'Forest', title: 'Shadowed Grove' };

  function refreshBars() {
    document.querySelector('.bar.hp i').style.width  = Math.max(0, Math.min(100, actor.hp / 20 * 100)) + '%';
    document.querySelector('.bar.mp i').style.width  = Math.max(0, Math.min(100, actor.mp / 10 * 100)) + '%';
    document.querySelector('.bar.sta i').style.width = Math.max(0, Math.min(100, actor.sta / 12 * 100)) + '%';
  }

  // ===== Movement (edge-clamped) =====
  function move(dir) {
    if (!shard?.size) return;

    const deltas = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
    const [dx, dy] = deltas[dir];

    const [W, H] = shard.size;
    const nx = clamp(pos.x + dx, 0, W - 1);
    const ny = clamp(pos.y + dy, 0, H - 1);

    if (nx === pos.x && ny === pos.y) {
      log("You can't go further that way.", 'log-note');
      return;
    }

    pos.x = nx; pos.y = ny;

    pos.biome = biomeAt(pos.x, pos.y);
    pos.title = randomTitleFor(pos.biome);

    setRoom({ title: pos.title, biome: pos.biome });
    log(`You move ${dir}. (${pos.x},${pos.y}) • ${pos.title} • ${pos.biome}`, 'log-note');

    const here = siteAt(pos.x, pos.y);
    if (here) log(`You see ${canonicalSettlement(here.type)} — ${here.name}.`, 'log-warn');

    lastSeen.resource = null; lastSeen.hotspot = null;

    renderMiniGrid();
    renderPOI();
    onEnterRoom(pos.biome);
  }

  // ===== Inventory (stub) =====
  const inventory = new Map();
  function addItem(id, name, qty) {
    const ex = inventory.get(id);
    if (ex) ex.qty += qty; else inventory.set(id, { name, qty });
    renderInventory();
  }
  function renderInventory() {
    if (!invList) return;
    invList.innerHTML = '';
    for (const [id, it] of inventory.entries()) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="name">${it.name}</span><span class="qty">×${it.qty}</span>`;
      invList.appendChild(li);
    }
  }

  // ===== Context Actions =====
  function doAction(act) {
    const biome = pos.biome;

    if (act === 'search') {
      log('You search carefully…', 'log-note');
      if (Math.random() < 0.35) {
        const ev = rollRoomEvent(biome);
        if (ev.type === 'resource') {
          lastSeen.resource = { node: ev.node, qty: ev.qty };
          log(`Found ${ev.node.name} ×${ev.qty}.`, 'log-ok');
        } else log('Nothing of note.', 'log-note');
      } else log('Nothing of note.', 'log-note');
      return;
    }

    if (act === 'harvest') {
      if (!lastSeen.resource) return log('There is nothing obvious to harvest here.', 'log-note');
      const { node, qty } = lastSeen.resource;
      addItem(node.id, node.name, qty);
      log(`You harvest ${node.name} ×${qty}. (+bag)`, 'log-ok');
      lastSeen.resource = null;
      actor.sta = Math.max(0, actor.sta - 1); refreshBars();
      return;
    }

    if (act === 'rest') {
      const heal = 2;
      actor.hp = Math.min(20, actor.hp + heal);
      actor.sta = Math.min(12, actor.sta + 2);
      refreshBars(); log(`You rest. (+${heal} HP, +2 STA)`, 'log-ok');
      return;
    }

    if (act === 'enter') {
      if (lastSeen.hotspot) log(`You step toward the ${lastSeen.hotspot.name}… (future: open interior overlay)`, 'log-warn');
      else log('There is nowhere special to enter here.', 'log-note');
      return;
    }
  }

  // ===== Layout sizing =====
  function resizeLayout() {
    const cs = getComputedStyle(document.documentElement);
    const ratio = parseFloat(cs.getPropertyValue('--card-ratio')) || 1;

    const topbarH = (document.querySelector('.topbar')?.offsetHeight) || 56;
    const vh = window.innerHeight;
    const vw = Math.min(window.innerWidth, 1400);
    const sideGutters = 64;
    const vGap = 22;
    const minConsole = 200;

    const heightBudget = Math.max(240, vh - topbarH - vGap - minConsole);
    const widthByHeight = Math.max(320, Math.floor(heightBudget / ratio));
    const widthByViewport = Math.max(320, Math.min(vw - sideGutters, 980));

    const cardW = Math.max(320, Math.min(widthByHeight, widthByViewport));
    const consoleH = Math.max(minConsole, vh - topbarH - Math.floor(cardW * ratio) - vGap);

    const root = document.documentElement.style;
    root.setProperty('--card-w', `${cardW}px`);
    root.setProperty('--console-h', `${consoleH}px`);
  }
  window.addEventListener('resize', resizeLayout);

  // ===== Wiring =====
  document.querySelectorAll('[data-qa]').forEach(b => {
    b.addEventListener('click', () => {
      const qa = b.dataset.qa;
      if (qa.startsWith('move')) move(qa.slice(-1).toUpperCase());
      else if (['search', 'harvest', 'rest', 'enter'].includes(qa)) doAction(qa);
      else if (qa === 'help') log('Try: Move N/E/S/W, Search, Harvest, Rest, Enter.', 'log-note');
    });
  });

  function runCommand(s) {
    const t = s.trim().toLowerCase(); if (!t) return;
    log(`> ${s}`, 'dim');

    if (t === 'help') return log('Commands: move n/e/s/w, search, harvest, rest, enter.', 'log-note');
    if (t.startsWith('move')) {
      const dir = t.split(/\s+/)[1]?.toUpperCase();
      if (['N', 'E', 'S', 'W'].includes(dir)) move(dir);
      else log('Use: move n|e|s|w', 'log-note');
      return;
    }
    if (['search', 'harvest', 'rest', 'enter'].includes(t)) return void doAction(t);

    log('Unknown command. Type "help".', 'log-note');
  }
  cmdSend.addEventListener('click', () => { runCommand(cmdInput.value); cmdInput.value = ''; });
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runCommand(cmdInput.value); cmdInput.value = ''; } });

  function toggle(el, show) {
    const forceClose = show === false;
    el.classList.toggle('hidden',
      forceClose ? true : el.classList.contains('hidden') ? false : true
    );

    if (el === overlayMap && !el.classList.contains('hidden')) {
      requestAnimationFrame(() => {
        renderMiniGrid();
        renderPOI();
      });
    }
  }

  btnWorldMap.addEventListener('click', () => toggle(overlayMap));
  btnCharacter.addEventListener('click', () => toggle(overlayChar));
  btnInventory?.addEventListener('click', () => toggle(overlayInv));
  document.querySelectorAll('[data-close="map"]').forEach(el => el.addEventListener('click', () => toggle(overlayMap, false)));
  document.querySelectorAll('[data-close="char"]').forEach(el => el.addEventListener('click', () => toggle(overlayChar, false)));
  document.querySelectorAll('[data-close="inv"]').forEach(el => el.addEventListener('click', () => toggle(overlayInv, false)));

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const map = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
      move(map[e.key]); return;
    }
    if (e.key.toLowerCase() === 'c') { toggle(overlayChar); }
    if (e.key.toLowerCase() === 'm') { toggle(overlayMap); }
    if (e.key === 'Escape') { toggle(overlayMap, false); toggle(overlayChar, false); toggle(overlayInv, false); }
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (!overlayMap.classList.contains('hidden')) {
      renderMiniGrid();
      renderPOI();
    }
  });

  // ===== Shard list (optional UI) =====
  async function fetchShardList() {
    const res = await fetch('/api/shards');
    if (!res.ok) throw new Error('Failed to list shards');
    return res.json(); // [{file, path, meta}, ...]
  }
  function labelForItem(it) {
    const disp = it?.meta?.displayName || it?.meta?.name;
    return disp ? `${disp} (${it.file})` : it.file;
  }
  async function populateShardPicker(items) {
    if (!shardSelect || !Array.isArray(items)) return;
    shardSelect.innerHTML = '';
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.path;            // absolute static path to JSON
      opt.dataset.name = it.file;
      opt.textContent = labelForItem(it);
      shardSelect.appendChild(opt);
    });
    if (!items.length) setShardStatus('No shards found. Use generator to create one.', 'warn');
  }

  // ===== Shard loader =====
  async function loadShard(url){
    setShardStatus('Loading…');
    const res = await fetch(url);
    if (!res.ok) { setShardStatus('Failed to load shard.', 'error'); throw new Error(`HTTP ${res.status} for ${url}`); }
    const data = await res.json();

    // Prefer canonical forms if present; still accept legacy `tiles`/`pois`
    let grid = data.grid;
    if (!grid && Array.isArray(data.tiles)) {
      grid = data.tiles.map(row => row.map(cell => (typeof cell === 'string' ? cell : cell?.biome)));
    }
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) {
      console.error('Shard JSON keys:', Object.keys(data));
      setShardStatus('Shard grid missing or malformed.', 'error');
      throw new Error('Invalid shard: grid missing or malformed');
    }

    const W = (Array.isArray(data.size) && data.size[0]) ||
              (data.meta && data.meta.width) ||
              grid[0].length;

    const H = (Array.isArray(data.size) && data.size[1]) ||
              (data.meta && data.meta.height) ||
              grid.length;

    const sites = data.sites || (Array.isArray(data.pois) ? data.pois.map(p => ({
      name: p.name, type: p.type, pos: p.pos ? p.pos.slice() : [p.x, p.y], meta: p.meta
    })) : []);

    // Warn (once) if shard isn't canonical, but don't block rendering
    assertCanonicalGrid(grid);

    shard = { ...data, grid, size: [Number(W), Number(H)], sites };

    // Clamp/seed pos inside bounds
    const [cW, cH] = shard.size;
    if (Array.isArray(shard.spawn)) {
      pos.x = clamp(shard.spawn[0], 0, cW - 1);
      pos.y = clamp(shard.spawn[1], 0, cH - 1);
    } else {
      pos.x = clamp(pos.x, 0, cW - 1);
      pos.y = clamp(pos.y, 0, cH - 1);
    }

    pos.biome = biomeAt(pos.x, pos.y);
    pos.title = randomTitleFor(pos.biome);

    renderMiniGrid();
    updateMiniHere(pos.x, pos.y);
    resizeLayout();
    setRoom({ title: pos.title, biome: pos.biome });
    refreshBars();
    log('Shard loaded: ' + (shard.name || shard?.meta?.displayName || 'Unnamed Shard'), 'log-note');
    onEnterRoom(pos.biome);

    if (shardSelect && url) {
      for (const o of shardSelect.options) { if (o.value === url) { o.selected = true; break; } }
      setShardStatus(`Loaded ${shardSelect.selectedOptions[0]?.dataset?.name || 'shard'}.`);
    } else {
      setShardStatus('Loaded.');
    }
  }

  // Optional: wire picker buttons if present
  btnLoadShard?.addEventListener('click', async () => {
    const url = shardSelect?.value;
    if (!url) return;
    setShardStatus('Loading…');
    await loadShard(url);
  });
  shardSelect?.addEventListener('change', () => btnLoadShard?.click());

  // ===== Init =====
  (async () => {
    try {
      const items = await fetchShardList();
      await populateShardPicker(items);
      if (items && items.length) {
        await loadShard(items[0].path);   // auto-load first available shard
      } else {
        // Fallback to legacy default path (safe if file exists)
        const DEFAULT_PATH = '/static/public/shards/shard_isle_of_cinder.json';
        await loadShard(DEFAULT_PATH);
      }
    } catch (e) {
      console.warn('Auto-load failed:', e);
      setShardStatus('Please generate or select a shard to load.', 'warn');
    }
  })();

  // ===== Debug handle (optional) =====
  window.__mvp2 = {
    get shard(){ return shard; },
    get pos(){ return pos; },
    get size(){ return shard?.size; },
    get grid(){ return shard?.grid; },
    getViewWindow,
    renderMiniGrid,
    renderPOI,
  };
})();
