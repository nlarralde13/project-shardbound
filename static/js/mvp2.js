// MVP2 — room-first controller, wide/short layout, JSON shard loader,
// biome-colored settlements, POI overlay, inventory stub.
import { BIOMES, randomTitleFor, BIOME_COLORS } from './biomeRegistry.js';
import { rollRoomEvent } from './eventTables.js';
import { SETTLEMENT_TYPES, poiClassFor } from './settlementRegistry.js';

(function(){
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

  // ===== Shard data & helpers =====
  let shard = null;
  function biomeAt(x, y){
    if (!shard) return 'Forest';
    if (y < 0 || y >= shard.size[1] || x < 0 || x >= shard.size[0]) return 'Coast';
    return shard.grid[y][x] || 'Coast';
  }
  function siteAt(x, y){
    if (!shard?.sites) return null;
    return shard.sites.find(s => s.pos[0] === x && s.pos[1] === y) || null;
  }
  const colorForBiome = (b) => BIOME_COLORS[b] || '#a0a0a0';

  // ===== Character & position =====
  const actor = { hp: 20, mp: 10, sta: 12 };
  let pos = { x: 12, y: 7, biome: 'Forest', title: 'Shadowed Grove' };

  // ===== Console log =====
  function log(text, cls='') {
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
    roomArt.style.background = b.tint;
    if (b.art) {
      roomArt.style.backgroundImage = `url("${b.art}")`;
      roomArt.style.backgroundSize  = 'contain';
      roomArt.style.backgroundPosition = 'center';
      roomArt.style.backgroundRepeat = 'no-repeat';
    } else {
      roomArt.style.backgroundImage = '';
    }
  }
  function describe(biomeKey){
    return {
      Forest: 'Tall trunks crowd the path; spores drift like dust in a sunbeam.',
      Plains: 'Grass bows to a steady wind. The horizon feels endless.',
      Coast:  'Gulls cry over slate water; salt stings your lips.',
      Desert: 'Heat wriggles above the sand. Footprints vanish behind you.',
      Volcano:'Ash crunches underfoot. The air tastes of metal.',
      Tundra: 'Cold bites the lungs; the world speaks in pale whispers.'
    }[biomeKey] || 'You stand at a crossroads of the unknown.';
  }
  function setRoom(next) {
    const b = next.biome;
    roomTitle.textContent = next.title || randomTitleFor(b);
    roomBiome.textContent = b;
    applyArt(b);
    log(describe(b), 'log-note');
  }

  // ===== Mini-grid in Map overlay =====
  const GRID_W = 16, GRID_H = 16;
  let lastHere = null;

  function renderMiniGrid(gridData) {
    if (!miniGridEl) return;
    miniGridEl.innerHTML = '';
    const h = gridData.length, w = gridData[0].length;
    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        const d = document.createElement('div');
        d.className = `cell ${gridData[y][x]}`;
        d.dataset.x = x; d.dataset.y = y;
        miniGridEl.appendChild(d);
      }
    }
  }
  function updateMiniHere(x, y) {
    if (!miniGridEl) return;
    const gx = ((x % GRID_W) + GRID_W) % GRID_W;
    const gy = ((y % GRID_H) + GRID_H) % GRID_H;
    if (lastHere) lastHere.classList.remove('here');
    const idx = gy * GRID_W + gx;
    const cell = miniGridEl.children[idx];
    if (cell) { cell.classList.add('here'); lastHere = cell; }
  }

  // ===== POI markers (settlements adopt biome color) =====
  // Replace your current renderPOI with this version
    function renderPOI(){
    if (!shard || !miniGridEl || !mapPOI) return;

    // If grid has no size yet (overlay hidden), try again next frame
    const boxW = miniGridEl.clientWidth;
    const boxH = miniGridEl.clientHeight;
    if (!boxW || !boxH) {
        requestAnimationFrame(renderPOI);
        return;
    }

    // Ensure the POI layer sits exactly on top of the grid
    const parent = miniGridEl.parentElement; // usually .map-box or .map-frame
    if (parent) {
        // Make the parent a positioning context
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.position === 'static') parent.style.position = 'relative';

        // Anchor POI layer over the grid's box
        mapPOI.style.position = 'absolute';
        mapPOI.style.left = miniGridEl.offsetLeft + 'px';
        mapPOI.style.top  = miniGridEl.offsetTop  + 'px';
        mapPOI.style.width  = boxW + 'px';
        mapPOI.style.height = boxH + 'px';
        mapPOI.style.pointerEvents = 'none';
        mapPOI.style.zIndex = 2;
    }

    const [W, H] = shard.size; // 16x16
    const cellW = boxW / W;
    const cellH = boxH / H;

    mapPOI.innerHTML = '';
    (shard.sites || []).forEach(s => {
        const [x, y] = s.pos;

        const el = document.createElement('div');
        el.className = poiClassFor(s.type);

        // biome-colored settlements (keeps your MVP2.1 requirement)
        if (s.type === 'settlement') {
        el.style.background = colorForBiome(biomeAt(x, y));
        }

        // center inside the cell (marker is 14px, so subtract 7)
        el.style.position = 'absolute';
        el.style.left = `${x * cellW + (cellW / 2) - 7}px`;
        el.style.top  = `${y * cellH + (cellH / 2) - 7}px`;
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '50%';
        el.title = `${s.name} (${s.type})`;

        mapPOI.appendChild(el);
    });
    }


    window._poiDebug = function(flag=true){
        if (!flag) return;
        if (!shard) return console.warn("No shard loaded");
        console.log("Shard size:", shard.size);
        console.log("mapPOI box:", mapPOI.clientWidth, mapPOI.clientHeight);
        console.log("Cell size:", mapPOI.clientWidth/shard.size[0], mapPOI.clientHeight/shard.size[1]);
        console.log("Sites:", shard.sites);
        };



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

  // ===== HUD bars =====
  function refreshBars() {
    document.querySelector('.bar.hp i').style.width  = Math.max(0, Math.min(100, actor.hp/20*100)) + '%';
    document.querySelector('.bar.mp i').style.width  = Math.max(0, Math.min(100, actor.mp/10*100)) + '%';
    document.querySelector('.bar.sta i').style.width = Math.max(0, Math.min(100, actor.sta/12*100)) + '%';
  }

  // ===== Movement =====
  function move(dir){
    const deltas = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
    const [dx,dy] = deltas[dir]; pos.x += dx; pos.y += dy;

    pos.biome = biomeAt(pos.x, pos.y);
    pos.title = randomTitleFor(pos.biome);

    setRoom({ title: pos.title, biome: pos.biome });
    log(`You move ${dir}. (${pos.x},${pos.y}) • ${pos.title} • ${pos.biome}`, 'log-note');

    // show site hint if present
    const here = siteAt(pos.x, pos.y);
    if (here) log(`You see ${here.type === 'port' ? 'a port' : here.type} — ${here.name}.`, 'log-warn');

    lastSeen.resource = null; lastSeen.hotspot = null;
    updateMiniHere(pos.x, pos.y);
    onEnterRoom(pos.biome);
  }

  // ===== Inventory (stub) =====
  const inventory = new Map();
  function addItem(id, name, qty){
    const ex = inventory.get(id);
    if (ex) ex.qty += qty; else inventory.set(id, { name, qty });
    renderInventory();
  }
  function renderInventory(){
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
      addItem(node.id, node.name, qty);   // stash items
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

  // ===== Layout sizing — keep room+console on-screen =====
  function resizeLayout(){
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
      else if (['search','harvest','rest','enter'].includes(qa)) doAction(qa);
      else if (qa === 'help') log('Try: Move N/E/S/W, Search, Harvest, Rest, Enter.', 'log-note');
    });
  });

  function runCommand(s){
    const t = s.trim().toLowerCase(); if (!t) return;
    log(`> ${s}`, 'dim');

    if (t === 'help') return log('Commands: move n/e/s/w, search, harvest, rest, enter.', 'log-note');
    if (t.startsWith('move')) {
      const dir = t.split(/\s+/)[1]?.toUpperCase();
      if (['N','E','S','W'].includes(dir)) move(dir);
      else log('Use: move n|e|s|w', 'log-note');
      return;
    }
    if (['search','harvest','rest','enter'].includes(t)) return void doAction(t);

    log('Unknown command. Type "help".', 'log-note');
  }
  cmdSend.addEventListener('click', () => { runCommand(cmdInput.value); cmdInput.value=''; });
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runCommand(cmdInput.value); cmdInput.value=''; } });

  function toggle(el, show){
    const forceClose = show === false;
    el.classList.toggle('hidden', forceClose ? true : el.classList.contains('hidden') ? false : true);
    if (el === overlayMap && !el.classList.contains('hidden')) {
      updateMiniHere(pos.x, pos.y);
      renderPOI();
    }
  }
  // Replace your Map button toggle handler with this minor change:
  btnWorldMap.addEventListener('click', () => {
    toggle(overlayMap);
    if (!overlayMap.classList.contains('hidden')) {
      // Let the overlay paint, then measure
      requestAnimationFrame(() => {
        updateMiniHere(pos.x, pos.y);
        renderPOI();
      });
    }
  });

  btnCharacter.addEventListener('click', () => toggle(overlayChar));
  btnInventory?.addEventListener('click', () => toggle(overlayInv));
  document.querySelectorAll('[data-close="map"]').forEach(el => el.addEventListener('click', () => toggle(overlayMap, false)));
  document.querySelectorAll('[data-close="char"]').forEach(el => el.addEventListener('click', () => toggle(overlayChar, false)));
  document.querySelectorAll('[data-close="inv"]').forEach(el => el.addEventListener('click', () => toggle(overlayInv, false)));

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const map = { ArrowUp:'N', ArrowRight:'E', ArrowDown:'S', ArrowLeft:'W' };
      move(map[e.key]); return;
    }
    if (e.key.toLowerCase() === 'c') { toggle(overlayChar); }
    if (e.key.toLowerCase() === 'm') { toggle(overlayMap); }
    if (e.key === 'Escape') { toggle(overlayMap, false); toggle(overlayChar, false); toggle(overlayInv, false); }
  }, { passive:false });

  window.addEventListener('resize', () => {
    if (!overlayMap.classList.contains('hidden')) renderPOI();
  });

  // ===== Shard loader =====
  async function loadShard(url){
    const res = await fetch(url);
    shard = await res.json();

    // start at spawn
    if (Array.isArray(shard.spawn)) {
      pos.x = shard.spawn[0]; pos.y = shard.spawn[1];
      pos.biome = biomeAt(pos.x, pos.y);
      pos.title = randomTitleFor(pos.biome);
    }

    renderMiniGrid(shard.grid);
    updateMiniHere(pos.x, pos.y);

    resizeLayout();
    setRoom({ title: pos.title, biome: pos.biome });
    refreshBars();
    log('Shard loaded: ' + (shard.name || 'Unnamed Shard'), 'log-note');
    onEnterRoom(pos.biome);
  }

  // ===== Init =====
  loadShard('/static/data/shard_isle_of_cinder.json');
})();
