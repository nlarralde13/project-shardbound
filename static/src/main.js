// /static/src/main.js  — hover picker fix (half-tile inverse), info panel updates
import { computeIsoOrigin, updateDevStatsPanel } from './utils/mapUtils.js';
import { initChat } from './ui/chat.js';
import { togglePanel } from './ui/panels.js';
import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';
import { createPixiRenderer } from './gfx/pixiRenderer.js';
import { handleConsoleCommand } from './data/consoleCommands.js';
import { playerState, initPlayerForShard, onPlayerChange, movePlayerBy } from './state/playerState.js';

const LAST_SID_KEY = 'lastShardFile';
const DEFAULT_SID_FILE = 'shard_0_0.json';
const TILE_WIDTH = 32, TILE_HEIGHT = 16; // logical; renderer uses halves
const L = (...a) => console.log('[main]', ...a);

/* ── Console overlay (5-line log) ── 
function mountConsoleOverlay(rootSel = '#mapViewer') {
  const host = document.querySelector(rootSel);
  if (!host) return null;
  let el = document.getElementById('consoleView');
  if (!el) { el = document.createElement('div'); el.id = 'consoleView'; host.appendChild(el); }
  el.className = 'console-box';
  Object.assign(el.style, {
    position: 'absolute', left: '16px', right: '16px', bottom: '16px',
    height: '25%', padding: '10px 12px 12px', color: '#eee',
    background: 'rgba(10,10,10,.55)', borderTop: '1px solid #333',
    backdropFilter: 'saturate(120%) blur(2px)', zIndex: 4, overflowY: 'auto'
  });

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <strong>Console</strong>
      <div>
        <button id="consolePinBtn" title="Toggle click-through" style="margin-right:6px;">🧲</button>
        <button id="consoleClearBtn" title="Clear">🧹</button>
      </div>
    </div>
    <div id="consoleLog" style="font-family:monospace;font-size:.9rem;line-height:1.35;"></div>
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

  typeLine('A cold wind crosses the shard…');
  appendLine('Type "help" for commands.');
  return { appendLine, focus: () => input.focus() };
} */
/* ── Console overlay (5-line log) with Hide/Show ── */
/* ── Console overlay (5-line log) with Hide/Show + unread badge ── */
function mountConsoleOverlay(rootSel = '#mapViewer') {
  const host = document.querySelector(rootSel);
  if (!host) return null;

  let el = document.getElementById('consoleView');
  if (!el) { el = document.createElement('div'); el.id = 'consoleView'; host.appendChild(el); }

  el.className = 'console-box';
  Object.assign(el.style, {
    position: 'absolute', left: '16px', right: '16px', bottom: '16px',
    height: '25%', padding: '10px 12px 12px', color: '#eee',
    background: 'rgba(10,10,10,.55)', borderTop: '1px solid #333',
    backdropFilter: 'saturate(120%) blur(2px)', zIndex: 4, overflowY: 'auto'
  });

  el.innerHTML = `
    <div id="consoleHeader" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <strong id="consoleTitle">Console</strong>
        <span id="consoleBadge" 
              style="display:none;min-width:16px;height:16px;padding:0 6px;border-radius:999px;
                     font-size:12px;line-height:16px;text-align:center;font-weight:600;
                     background:#ff4757;color:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.25) inset;">
        </span>
      </div>
      <div>
        <button id="consoleMinBtn" title="Hide console" style="margin-right:6px;">Hide</button>
        <button id="consoleClearBtn" title="Clear">🧹</button>
      </div>
    </div>
    <div id="consoleLog" style="font-family:monospace;font-size:.9rem;line-height:1.35;"></div>
    <input id="commandInput" placeholder="Type a command… (Enter to run)"
           style="width:100%;margin-top:6px;background:rgba(30,30,30,.8);
                  border:1px solid #444;border-radius:6px;color:#eee;padding:6px 8px;" />
  `;

  const titleEl = el.querySelector('#consoleTitle');
  const badgeEl = el.querySelector('#consoleBadge');
  const minBtn  = el.querySelector('#consoleMinBtn');
  const clearBtn= el.querySelector('#consoleClearBtn');
  const logEl   = el.querySelector('#consoleLog');
  const input   = el.querySelector('#commandInput');

  // Persisted UI state
  const LS_MIN = 'consoleMinimized';
  const LS_CNT = 'consoleUnread';
  let minimized = localStorage.getItem(LS_MIN) === '1';
  let unread = Number(localStorage.getItem(LS_CNT) || 0);

  function updateBadge() {
    if (unread > 0) {
      badgeEl.textContent = unread > 99 ? '99+' : String(unread);
      badgeEl.style.display = 'inline-block';
    } else {
      badgeEl.style.display = 'none';
    }
    localStorage.setItem(LS_CNT, String(unread));
  }

  function applyMinimized() {
    if (minimized) {
      // compact bar on bottom-left
      el.style.height = '36px';
      el.style.width  = '280px';
      el.style.left   = '16px';
      el.style.right  = 'auto';
      el.style.overflowY = 'hidden';
      logEl.style.display = 'none';
      input.style.display = 'none';
      titleEl.textContent = 'Console (hidden)';
      minBtn.textContent = 'Show';
      minBtn.title = 'Show console';
      // leave unread count as-is while hidden
    } else {
      // full overlay
      el.style.height = '25%';
      el.style.width  = '';
      el.style.left   = '16px';
      el.style.right  = '16px';
      el.style.overflowY = 'auto';
      logEl.style.display = '';
      input.style.display = '';
      titleEl.textContent = 'Console';
      minBtn.textContent = 'Hide';
      minBtn.title = 'Hide console';
      // clear unread on reveal
      unread = 0;
      updateBadge();
    }
    localStorage.setItem(LS_MIN, minimized ? '1' : '0');
  }

  // Logging helpers
  const clamp5 = () => { while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild); logEl.scrollTop = logEl.scrollHeight; };
  const maybeBumpUnread = () => { if (minimized) { unread += 1; updateBadge(); } };
  const appendLine = (text) => { const d = document.createElement('div'); d.textContent = text; logEl.appendChild(d); clamp5(); maybeBumpUnread(); };
  const typeLine = (text, speed = 18) => {
    // Count as a single unread message while minimized
    maybeBumpUnread();
    let i = 0; const d = document.createElement('div'); logEl.appendChild(d);
    (function tick(){ d.textContent = (d.textContent||'') + text[i++]; i<text.length ? setTimeout(tick, speed) : clamp5(); })();
  };

  // Interactions
  minBtn.addEventListener('click', () => { minimized = !minimized; applyMinimized(); });
  // Optional: backtick toggles show/hide (when not typing)
  window.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    if (!typing && e.key === '`') { e.preventDefault(); minimized = !minimized; applyMinimized(); }
  });

  clearBtn.addEventListener('click', () => { logEl.innerHTML = ''; });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (!text) return;
      appendLine(`> ${text}`);
      input.value = '';
      const out = handleConsoleCommand(text, window.__consoleCtx || {});
      if (out === '__clear__') { logEl.innerHTML = ''; }
      else if (out) out.split('\n').forEach(appendLine);
      e.preventDefault();
    }
  });

  // First-run UX
  if (!localStorage.getItem(LS_MIN)) {
    appendLine('Type "help" for commands.');
  }
  typeLine('A cold wind crosses the shard…');

  // Apply persisted state & badge
  updateBadge();
  applyMinimized();

  return {
    appendLine,
    focus: () => input.focus(),
    setMinimized: (v) => { minimized = !!v; applyMinimized(); },
    isMinimized: () => minimized,
    // Optional: expose a way to bump unread from outside
    bumpUnread: (n=1) => { unread = Math.max(0, unread + n); updateBadge(); },
  };
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

/* Inverse iso picking (matches renderer's half-tile math) */
function screenToTileIso(x, y, origin, tileW, tileH, shard) {
  const hx = tileW / 2, hy = tileH / 2; // renderer uses halves
  const dx = x - origin.x;
  const dy = y - origin.y;
  let ix = Math.floor((dx / hx + dy / hy) * 0.5);
  let iy = Math.floor((dy / hy - dx / hx) * 0.5);
  if (!shard) return null;
  if (ix < 0 || iy < 0 || ix >= shard.width || iy >= shard.height) return null;
  return { x: ix, y: iy };
}

/* ── Boot ── */
window.addEventListener('DOMContentLoaded', async () => {
  L('boot');

  const mapViewer = document.getElementById('mapViewer');
  if (mapViewer && getComputedStyle(mapViewer).position === 'static') mapViewer.style.position = 'relative';

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

  // load shard
  const sidFile = localStorage.getItem(LAST_SID_KEY) || DEFAULT_SID_FILE;
  let shard = await loadShardAuto(sidFile);
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
    tileH: TILE_HEIGHT / 2,
    chunkSize: 64,            // safe, DPR-friendly
    maxResidentChunks: 36,
    prefetchRadius: 1,
    buildBudgetMs: 6,
    overviewEnabled: false,   // OFF = no lockups
  });
  pixi.setOrigin(origin);
  origin = pixi.getOrigin();  // keep picking math aligned
  pixi.resize();

  // expose for quick devtools commands (optional)
  window.pixi = pixi;

  // player spawn / sync
  initPlayerForShard(shard);
  pixi.setPlayer(playerState.x, playerState.y);
  onPlayerChange(p => { pixi.setPlayer(p.x, p.y); });

  const centerOnPlayer = () =>
    pixi.centerOn(playerState.x, playerState.y, canvas.width, canvas.height);

  // console command context
  window.__consoleCtx = { canvas, shard, pixi, player: playerState, center: centerOnPlayer };

  // resize handling
  window.addEventListener('resize', () => {
    if (sizeCanvasToWrapper(canvas, wrapper)) {
      origin = computeIsoOrigin(canvas.width, canvas.height);
      pixi.setOrigin(origin);
      origin = pixi.getOrigin(); // ← align to renderer's rounded origin
      pixi.resize();
    }
  });

  // chat (guard if elements missing)
  if (document.querySelector('#chatHistory') && document.querySelector('#chatInput')) {
    initChat('#chatHistory', '#chatInput');
  } else {
    console.log('[chat] Skipping init: missing #chatHistory or #chatInput');
  }

  // Picking: inverse WORLD transform
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
    const t = screenToTileIso(x, y, origin, TILE_WIDTH, TILE_HEIGHT, shard);
    if ((t?.x !== hoverTile?.x) || (t?.y !== hoverTile?.y)) {
      hoverTile = t || null;
      pixi.setHover(hoverTile);
      canvas.style.cursor = hoverTile ? 'pointer' : 'default';
      if (typeof updateDevStatsPanel === 'function') {
        updateDevStatsPanel(hoverTile ? { ...hoverTile, tile: shard.tiles[hoverTile.y][hoverTile.x] } : undefined);
      }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoverTile = null;
    pixi.setHover(null);
    canvas.style.cursor = 'default';
    if (typeof updateDevStatsPanel === 'function') updateDevStatsPanel(undefined);
  });

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = toWorld(e.clientX - r.left, e.clientY - r.top);
    const t = screenToTileIso(x, y, origin, TILE_WIDTH, TILE_HEIGHT, shard);
    if (!t) return;
    selectedTile = t;
    pixi.setSelected(selectedTile);
    window.__lastSelectedTile = t;
    if (typeof updateDevStatsPanel === 'function') {
      updateDevStatsPanel({ ...t, tile: shard.tiles[t.y][t.x] });
    }
  });

  // Arrow keys move the PLAYER (tile-by-tile)
  window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return; // don't steal while typing
    const k = e.key.toLowerCase();
    let dx = 0, dy = 0;
    if (k === 'arrowup'   || k === 'w') dy = -1;
    else if (k === 'arrowdown' || k === 's') dy = 1;
    else if (k === 'arrowleft' || k === 'a') dx = -1;
    else if (k === 'arrowright'|| k === 'd') dx = 1;
    else return;
    e.preventDefault();
    movePlayerBy(dx, dy, shard);
  });

  // save/load/regen (wire as before)
  document.getElementById('saveShard')?.addEventListener('click', () => {
    try { saveShard?.(shard); say?.('Shard saved.'); } catch (e) { say?.(`Save failed: ${e?.message || e}`); }
  });

  document.getElementById('loadShardBtn')?.addEventListener('click', () =>
    document.getElementById('loadShardInput')?.click()
  );

  document.getElementById('loadShardInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const s = await loadShardFromFile?.(f);
      if (s) {
        window.__currentShard = s;
        shard = s;
        if (window.__consoleCtx) window.__consoleCtx.shard = s;

        localStorage.setItem(LAST_SID_KEY, f.name);
        say?.(`Loaded shard: ${f.name}`);

        pixi.setShard(s);
        initPlayerForShard(s);
        pixi.setPlayer(playerState.x, playerState.y);

        origin = computeIsoOrigin(canvas.width, canvas.height);
        pixi.setOrigin(origin);
        origin = pixi.getOrigin();
      }
    } catch (err) { say?.(`Load failed: ${err?.message || err}`); }
    finally { e.target.value = ''; }
  });

  document.getElementById('regenWorld')?.addEventListener('click', async () => {
    try {
      const s = await regenerateShard?.({});
      if (s) {
        window.__currentShard = s;
        shard = s;
        if (window.__consoleCtx) window.__consoleCtx.shard = s;

        localStorage.setItem(LAST_SID_KEY, DEFAULT_SID_FILE);
        say?.('Shard regenerated.');

        pixi.setShard(s);
        initPlayerForShard(s);
        pixi.setPlayer(playerState.x, playerState.y);

        origin = computeIsoOrigin(canvas.width, canvas.height);
        pixi.setOrigin(origin);
        origin = pixi.getOrigin();
      }
    } catch (err) { say?.(`Regen failed: ${err?.message || err}`); }
  });

  say?.(`Ready. Current shard: ${sidFile}`);
});
