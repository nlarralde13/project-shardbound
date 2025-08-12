// Boots Pixi, overlay console, player token + movement (console + arrows), SFX+shake.

import { computeIsoOrigin, getTileUnderMouseIso, updateDevStatsPanel } from './utils/mapUtils.js';
import { initChat, sendMessage } from './ui/chat.js';
import { togglePanel } from './ui/panels.js';
import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';
import { createPixiRenderer } from './gfx/pixiRenderer.js';
import { handleConsoleCommand } from './data/consoleCommands.js';

import {
  playerState,
  initPlayerForShard,
  onPlayerChange,
  movePlayerBy,
  setPlayerPosition
} from './state/playerState.js';

const PLAYER = 'Player1';
const LAST_SID_KEY = 'lastShardFile';
const DEFAULT_SID_FILE = 'shard_0_0.json';
const TILE_WIDTH = 32, TILE_HEIGHT = 16; // source of truth for picking
const L = (...a) => console.log('[main]', ...a);

/* ── SFX & shake ── */
function sfx(type = 'ui') {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  const t = ctx.currentTime, A = 0.02, D = 0.12;
  const f = type === 'select' ? 540 : type === 'ok' ? 660 : 420;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + A);
  g.gain.exponentialRampToValueAtTime(0.0001, t + A + D);
  o.start(t); o.stop(t + A + D + 0.02);
}
function screenShake(el = document.getElementById('mapViewer'), mag = 6, ms = 120) {
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / ms), d = 1 - p;
    el.style.transform = `translate(${(Math.random()*2-1)*mag*d}px, ${(Math.random()*2-1)*mag*d}px)`;
    if (p < 1) requestAnimationFrame(tick);
    else el.style.transform = '';
  })(start);
}

/* ── Console overlay ── */
function mountConsoleOverlay(rootSel = '#mapViewer') {
  const host = document.querySelector(rootSel);
  if (!host) return null;

  let el = document.getElementById('consoleView');
  if (!el) { el = document.createElement('div'); el.id = 'consoleView'; host.appendChild(el); }
  el.classList.add('console-box');
  Object.assign(el.style, {
    position: 'absolute', left: '16px', right: '16px', bottom: '16px',
    height: '25%', padding: '10px 12px 12px', color: '#eee',
    background: 'rgba(10,10,10,.55)', borderTop: '1px solid #333',
    backdropFilter: 'saturate(120%) blur(2px)', zIndex: 4, overflowY: 'auto'
  });

  el.innerHTML = `
    <div class="console-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <strong>Console</strong>
      <div>
        <button id="consolePinBtn" title="Toggle click-through" style="margin-right:6px;">🧲</button>
        <button id="consoleClearBtn" title="Clear">🧹</button>
      </div>
    </div>
    <div id="consoleLog" class="console-log" style="font-family:monospace;font-size:.9rem;line-height:1.35;"></div>
    <input id="commandInput" placeholder="Type a command… (Enter to run)"
           style="width:100%;margin-top:6px;background:rgba(30,30,30,.8);
                  border:1px solid #444;border-radius:6px;color:#eee;padding:6px 8px;" />
  `;

  const logEl = el.querySelector('#consoleLog');
  const input = el.querySelector('#commandInput');

  const clamp5 = () => {
    while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  };
  const appendLine = (text) => { const d = document.createElement('div'); d.textContent = text; logEl.appendChild(d); clamp5(); };
  const typeLine = (text, speed = 18) => {
    let i = 0; const d = document.createElement('div'); logEl.appendChild(d);
    (function tick(){ d.textContent = (d.textContent||'') + text[i++]; i<text.length ? setTimeout(tick, speed) : clamp5(); })();
  };

  el.querySelector('#consolePinBtn')?.addEventListener('click', () => {
    el.classList.toggle('passthrough');
    el.style.pointerEvents = el.classList.contains('passthrough') ? 'none' : 'auto';
  });
  el.querySelector('#consoleClearBtn')?.addEventListener('click', () => { logEl.innerHTML = ''; });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (!text) return;
      appendLine(`> ${text}`);
      input.value = '';
      const out = handleConsoleCommand(text, window.__consoleCtx || {});
      if (out === '__clear__') logEl.innerHTML = '';
      else if (out) out.split('\n').forEach(appendLine);
      e.preventDefault();
    }
  });

  // flavor
  typeLine('A cold wind crosses the shard…');
  appendLine('Type "help" for commands.');

  return { appendLine, focus: () => input.focus(), logEl };
}

/* ── helpers ── */
function sizeCanvasToWrapper(canvas, wrapper) {
  const w = wrapper.clientWidth, h = wrapper.clientHeight;
  if (w && h && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; return true; }
  return false;
}
async function loadShardAuto(fileName) {
  const tries = [
    `/static/public/shards/${fileName}`,
    `/public/shards/${fileName}`,
    `/static/shards/${fileName}`,
    `/shards/${fileName}`,
    fileName
  ];
  for (const url of tries) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { const j = await r.json(); j.id = j.id || fileName.replace(/\.json$/,''); return j; } }
    catch { /* try next */ }
  }
  return null;
}

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', async () => {
  L('boot');

  const mapViewer = document.getElementById('mapViewer');
  if (mapViewer && getComputedStyle(mapViewer).position === 'static') mapViewer.style.position = 'relative';

  // panel toggles
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) { const ic = document.createElement('span'); ic.className = 'toggle-icon'; ic.textContent = '+'; btn.appendChild(ic); }
    btn.addEventListener('click', () => togglePanel(btn.dataset.target));
  });

  const wrapper = document.getElementById('viewportWrapper') || mapViewer;
  const canvas  = document.getElementById('viewport');
  if (!wrapper || !canvas) return console.error('[main] missing viewport');

  // overlay console
  const consoleUI = mountConsoleOverlay('#mapViewer');
  const say = (m) => consoleUI?.appendLine?.(m);

  // zoom id shim (optional)
  for (const [from, to] of [['zoomInBtn','zoomIn'], ['zoomOutBtn','zoomOut'], ['zoomOverlay','zoomDisplay']]) {
    const el = document.getElementById(from); if (el && !document.getElementById(to)) el.id = to;
  }

  // load shard
  const sidFile = localStorage.getItem(LAST_SID_KEY) || DEFAULT_SID_FILE;
  const shard = await loadShardAuto(sidFile);
  if (!shard) { say?.(`Failed to load ${sidFile}`); return; }
  window.__currentShard = shard;
  localStorage.setItem(LAST_SID_KEY, sidFile);
  L('shard loaded', sidFile, shard);

  // size canvas + PIXI
  sizeCanvasToWrapper(canvas, wrapper);
  let origin = computeIsoOrigin(canvas.width, canvas.height);
  const pixi = createPixiRenderer({
    canvas,
    shard,
    tileW: TILE_WIDTH / 2,
    tileH: TILE_HEIGHT / 2
  });
  pixi.setOrigin(origin);
  pixi.resize();

  // player spawn / sync
  initPlayerForShard(shard);
  pixi.setPlayer(playerState.x, playerState.y);
  onPlayerChange(p => { pixi.setPlayer(p.x, p.y); });

  // center helper for console
  function centerOnPlayer() {
    const s = playerState;
    pixi.centerOn(s.x, s.y, canvas.width, canvas.height);
  }

  // console command context
  window.__consoleCtx = {
    canvas,
    shard,
    pixi,
    player: playerState,
    center: centerOnPlayer
  };

  // resize handling
  window.addEventListener('resize', () => {
    if (sizeCanvasToWrapper(canvas, wrapper)) {
      origin = computeIsoOrigin(canvas.width, canvas.height);
      pixi.setOrigin(origin);
      pixi.resize();
    }
  });

  // zoom buttons → pixi zoom at center
  const centerAnchor = () => ({ x: canvas.width/2, y: canvas.height/2 });
  document.getElementById('zoomIn')?.addEventListener('click', () => {
    const a = centerAnchor(); pixi.zoomInAt(a.x, a.y);
    const label = document.getElementById('zoomDisplay'); if (label) label.textContent = `${Math.round((pixi.world?.scale?.x||1)*100)}%`;
  });
  document.getElementById('zoomOut')?.addEventListener('click', () => {
    const a = centerAnchor(); pixi.zoomOutAt(a.x, a.y);
    const label = document.getElementById('zoomDisplay'); if (label) label.textContent = `${Math.round((pixi.world?.scale?.x||1)*100)}%`;
  });

  // chat (guard if elements missing)
  const chatHistoryEl = document.querySelector('#chatHistory');
  const chatInputEl   = document.querySelector('#chatInput');
  if (chatHistoryEl && chatInputEl) {
    initChat('#chatHistory', '#chatInput');
  } else {
    console.log('[chat] Skipping init: missing #chatHistory or #chatInput');
  }

  // actions (+ SFX + shake)
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => sfx('ok'));
    btn.addEventListener('click', () => sendMessage?.(`${PLAYER} used ${btn.dataset.action || btn.title || 'Action'}`));
  });
  document.querySelector('[data-action="Fireball"]')?.addEventListener('click', () => screenShake());

  // inverse WORLD transform for picking
  let hoverTile = null, selectedTile = null;
  function toWorld(mx, my) {
    const w = pixi?.world || pixi?.stage;
    const s = w?.scale?.x || 1;
    const pos = w?.position || { x: 0, y: 0 };
    return { x: (mx - pos.x) / s, y: (my - pos.y) / s };
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = toWorld(e.clientX - r.left, e.clientY - r.top);
    const t = getTileUnderMouseIso(
      x, y, canvas, shard, origin, TILE_WIDTH, TILE_HEIGHT
    );
    if ((t?.x !== hoverTile?.x) || (t?.y !== hoverTile?.y)) {
      hoverTile = t || null;
      pixi.setHover(hoverTile);
      canvas.style.cursor = hoverTile ? 'pointer' : 'default';
    }
  });

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = toWorld(e.clientX - r.left, e.clientY - r.top);
    const t = getTileUnderMouseIso(
      x, y, canvas, shard, origin, TILE_WIDTH, TILE_HEIGHT
    );
    if (!t) return;
    selectedTile = t;
    pixi.setSelected(selectedTile);
    window.__lastSelectedTile = t;
    updateDevStatsPanel?.(t);
    togglePanel('infoPanel');
    sfx('select');
  });

  // Arrow keys move the PLAYER (WASD still free for camera if you add it later)
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    let dx = 0, dy = 0;
    if (k === 'arrowup') dy = -1;
    else if (k === 'arrowdown') dy = 1;
    else if (k === 'arrowleft') dx = -1;
    else if (k === 'arrowright') dx = 1;
    else return;

    e.preventDefault();
    movePlayerBy(dx, dy, shard);
    sfx('select');
    // keep token in view if you want:
    // centerOnPlayer();
  });

  // dev buttons
  document.getElementById('saveShard')?.addEventListener('click', () => {
    try { saveShard?.(shard); say?.('Shard saved.'); } catch (e) { say?.(`Save failed: ${e?.message || e}`); }
  });
  document.getElementById('loadShardBtn')?.addEventListener('click', () => document.getElementById('loadShardInput')?.click());
  document.getElementById('loadShardInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const s = await loadShardFromFile?.(f);
      if (s) {
        window.__currentShard = s;
        localStorage.setItem(LAST_SID_KEY, f.name);
        say?.(`Loaded shard: ${f.name}`);
        pixi.setShard(s); initPlayerForShard(s); pixi.setPlayer(playerState.x, playerState.y);
        origin = computeIsoOrigin(canvas.width, canvas.height); pixi.setOrigin(origin);
      }
    } catch (err) { say?.(`Load failed: ${err?.message || err}`); }
    finally { e.target.value = ''; }
  });
  document.getElementById('regenWorld')?.addEventListener('click', async () => {
    try {
      const s = await regenerateShard?.({}); if (s) {
        window.__currentShard = s;
        localStorage.setItem(LAST_SID_KEY, DEFAULT_SID_FILE);
        say?.('Shard regenerated.');
        pixi.setShard(s); initPlayerForShard(s); pixi.setPlayer(playerState.x, playerState.y);
        origin = computeIsoOrigin(canvas.width, canvas.height); pixi.setOrigin(origin);
      }
    } catch (err) { say?.(`Regen failed: ${err?.message || err}`); }
  });

  say?.(`Ready. Current shard: ${sidFile}`);
});
