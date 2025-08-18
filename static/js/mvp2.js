// MVP2 Prototype Wiring — no gameplay systems, just feel & flow.

(function(){
  const consoleEl = document.getElementById('console');
  const cmdInput  = document.getElementById('cmd');
  const cmdSend   = document.getElementById('cmdSend');

  const btnWorldMap = document.getElementById('btnWorldMap');
  const btnCharacter= document.getElementById('btnCharacter');
  const overlayMap  = document.getElementById('overlayMap');
  const overlayChar = document.getElementById('overlayChar');

  const roomTitle = document.getElementById('roomTitle');
  const roomBiome = document.getElementById('roomBiome');
  const roomText  = document.getElementById('roomText');
  const roomArt   = document.getElementById('roomArt');

  // Mock state
  let pos = { x: 12, y: 7, biome: 'Forest', title: 'Shadowed Grove' };

  function log(text, dim=false){
    const line = document.createElement('div');
    line.className = 'line' + (dim ? ' dim' : '');
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    // cap to ~150 lines to avoid DOM bloat
    if (consoleEl.children.length > 200) consoleEl.removeChild(consoleEl.firstChild);
  }

  function setRoom({ title, biome, text }){
    roomTitle.textContent = title;
    roomBiome.textContent = biome;
    roomText.textContent  = text;
    // quick biome tint
    const tint = {
      Forest: 'linear-gradient(135deg,#1e3a2f,#0f2019)',
      Plains: 'linear-gradient(135deg,#2d3f1f,#182610)',
      Coast:  'linear-gradient(135deg,#123849,#0b1f2a)',
      Desert: 'linear-gradient(135deg,#513c1a,#2a1f10)',
      Volcano:'linear-gradient(135deg,#4a2121,#1f0f0f)'
    }[biome] || 'linear-gradient(135deg,#14324a,#0d1c2b)';
    roomArt.style.background = tint;
  }

  function move(dir){
    // purely illustrative — mutate coords and swap biome/title samples
    const deltas = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
    const [dx,dy] = deltas[dir];
    pos.x += dx; pos.y += dy;

    // cycle a few biomes for feel
    const biomes = ['Forest','Plains','Coast','Desert','Volcano'];
    const nextBiome = biomes[(pos.x + pos.y + biomes.length) % biomes.length];
    pos.biome = nextBiome;
    pos.title = {
      Forest:'Shadowed Grove', Plains:'Windworn Steppe', Coast:'Salt-Swept Strand',
      Desert:'Sun-Bleached Dune', Volcano:'Cindered Rim'
    }[nextBiome];

    setRoom({ title: pos.title, biome: pos.biome, text: describe(nextBiome) });
    log(`You move ${dir}.`, true);
    log(`(${pos.x},${pos.y}) • ${pos.title} • ${pos.biome}`);
    // mock: occasional event lines
    if (Math.random() < 0.25) log('You hear chittering in the brush…');
  }

  function describe(biome){
    return {
      Forest: 'Tall trunks crowd the path; spores drift like dust in a sunbeam.',
      Plains: 'Grass bows to a steady wind. The horizon feels endless.',
      Coast:  'Gulls cry over slate water; salt stings your lips.',
      Desert: 'Heat wriggles above the sand. Footprints vanish behind you.',
      Volcano:'Ash crunches underfoot. The air tastes of metal.'
    }[biome] || 'You stand at a crossroads of the unknown.';
  }

  // Exits
  document.querySelectorAll('.btn.exit').forEach(b => {
    b.addEventListener('click', () => move(b.dataset.dir));
  });

  // Context actions (mock)
  document.querySelectorAll('.room-controls .ctx .btn').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      const lines = {
        search: 'You search carefully… (nothing yet — prototype)',
        harvest:'You harvest what you can… (prototype)',
        rest:   'You take a moment to catch your breath. (prototype)',
        enter:  'You peer inside… (this would open a hotspot overlay in future)'
      };
      log(lines[act] || '…', true);
    });
  });

  // Quick actions bar
  document.querySelectorAll('[data-qa]').forEach(b => {
    b.addEventListener('click', () => {
      const qa = b.dataset.qa;
      if (qa.startsWith('move')) move(qa.slice(-1).toUpperCase());
      else if (qa === 'help') log('Try: Move N/E/S/W, Search, Harvest, Rest.', true);
    });
  });

  // Command line (optional)
  function runCommand(s){
    const t = s.trim().toLowerCase();
    if (!t) return;
    log(`> ${s}`);
    if (t === 'help') return log('Commands: move n/e/s/w, search, harvest, rest.', true);
    if (t.startsWith('move')) {
      const dir = t.split(/\s+/)[1]?.toUpperCase();
      if (['N','E','S','W'].includes(dir)) move(dir);
      else log('Use: move n|e|s|w', true);
      return;
    }
    if (['search','harvest','rest'].includes(t)) {
      document.querySelector(`.room-controls .ctx .btn[data-act="${t}"]`)?.click();
      return;
    }
    log('Unknown command. Type "help".', true);
  }
  cmdSend.addEventListener('click', () => { runCommand(cmdInput.value); cmdInput.value=''; });
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { runCommand(cmdInput.value); cmdInput.value=''; } });

  // Overlays
  function toggle(el, show){ el.classList.toggle('hidden', show === false ? true : el.classList.contains('hidden') ? false : true); }
  btnWorldMap.addEventListener('click', () => toggle(overlayMap));
  btnCharacter.addEventListener('click', () => toggle(overlayChar));
  document.querySelectorAll('[data-close="map"]').forEach(el => el.addEventListener('click', () => toggle(overlayMap, false)));
  document.querySelectorAll('[data-close="char"]').forEach(el => el.addEventListener('click', () => toggle(overlayChar, false)));

  // Hotkeys: C, M, ESC; prevent page scroll on arrows
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); } // keep inputs sane
      return;
    }
    if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const map = { ArrowUp:'N', ArrowRight:'E', ArrowDown:'S', ArrowLeft:'W' };
      move(map[e.key]); return;
    }
    if (e.key.toLowerCase() === 'c') { toggle(overlayChar); }
    if (e.key.toLowerCase() === 'm') { toggle(overlayMap); }
    if (e.key === 'Escape') { toggle(overlayMap, false); toggle(overlayChar, false); }
  }, { passive:false });

  // Initial render
  setRoom({ title: pos.title, biome: pos.biome, text: describe(pos.biome) });
  log('Room-first prototype loaded (MVP2). Press M for map, C for character.');
})();
