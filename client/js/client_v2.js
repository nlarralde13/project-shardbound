// static/js/client_v2.js
// Shard viewer + action HUD + unified loadout refresh, now with:
// - edge-to-edge viewer lock (no background)
// - disabled mouse-wheel zoom
// - injected N/E/S/W move buttons

import * as Viewer from './shard-viewer-lite.js';
import { API } from '/static/js/api.js';
import { initActionHUD, updateActionHUD } from './actionHud.js';
import { mountConsole } from '/static/src/console/consoleUI.js';
import { parse } from '/static/src/console/parse.js';
import { dispatch } from '/static/src/console/dispatch.js';

const q  = (sel, root=document) => root.querySelector(sel);
const qa = (sel, root=document) => [...root.querySelectorAll(sel)];

// ----- console bootstrap (unchanged) -----
mountConsole(document.getElementById('console-root'), {
  onSubmit: async (line, ctx = {}) => {
    const parsed = parse(line);
    return dispatch(
      { line, ...parsed, context: ctx },
      {
        rpcExec: async ({ line: single }) => {
          try {
            const r = await fetch('/api/console/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ line: single, context: ctx })
            });
            const json = await r.json().catch(() => null);
            return Array.isArray(json?.frames) ? json.frames : [];
          } catch (err) {
            return [{ type: 'text', data: String(err) }];
          }
        }
      }
    );
  }
});

// ----- guard for active character -----
async function guardAuthAndCharacter() {
  try {
    const active = await API.characterActive();
    if (!active) { window.location.href = '/characters'; return false; }
    window.dispatchEvent(new CustomEvent('character:ready', { detail: active }));
    return true;
  } catch (err) {
    console.error('Auth/character guard failed', err);
    return false;
  }
}

// ----- viewer helpers -----
function preventWheelZoom(el) {
  if (!el) return;
  el.addEventListener('wheel', (e) => {
    // block zoom/pan behavior from the wheel for now
    e.preventDefault();
  }, { passive: false });
}

function lockViewerFrameEdgeToEdge() {
  const frame   = document.querySelector('#frame');
  const canvas  = document.querySelector('#canvas');
  const overlay = document.querySelector('#overlayCanvasLite');
  if (!frame || !canvas || !overlay) return;

  Object.assign(frame.style,  { overflow: 'hidden', background: 'transparent' });
  for (const c of [canvas, overlay]) {
    Object.assign(c.style, { display: 'block', width: '100%', height: '100%', background: 'transparent' });
    c.addEventListener('wheel', (e) => e.preventDefault(), { passive: false }); // kill wheel-zoom
  }
  try { Viewer.setZoomEnabled?.(false); } catch {}
  try { Viewer.setPanEnabled?.(true); } catch {}
  try { Viewer.fit?.(); } catch {}
}

// ----- actions: base set + N/E/S/W -----
function wireBaseActionButtons() {
  const entries = [
    ['#btnLook',     async () => API.look()],
    ['#btnInteract', async () => API.interact()],
    ['#btnRest',     async () => API.spawn({ x: 0, y: 0 })],
    ['#btnSkill1',   async () => ({ log: ['You use Action 1.'] })],
    ['#btnSkill2',   async () => ({ log: ['You use Action 2.'] })],
  ];
  for (const [sel, fn] of entries) {
    const btn = q(sel);
    if (!btn) continue;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const out = await fn();
        if (out?.log) {
          const frames = out.log.map(t => ({ text: t, ts: Date.now() }));
          window.dispatchEvent(new CustomEvent('game:log', { detail: frames }));
          document.dispatchEvent(new CustomEvent('console:log', { detail: out.log.join('\n') }));
        }
      } catch (err) {
        document.dispatchEvent(new CustomEvent('console:log', { detail: String(err) }));
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function ensureMoveButtons() {
  const dock = q('#cardActions .quick-actions') || q('#cardActions') || q('#action-root');
  if (!dock) return;

  // create only if missing
  if (!q('#btnMoveN')) {
    const wrap = document.createElement('div');
    wrap.className = 'move-pad';
    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,36px);grid-auto-rows:36px;gap:6px;justify-content:center;margin-top:8px;">
        <span></span>
        <button id="btnMoveN"  title="North">N</button>
        <span></span>
        <button id="btnMoveW"  title="West">W</button>
        <button id="btnMoveC"  title="Center" disabled>·</button>
        <button id="btnMoveE"  title="East">E</button>
        <span></span>
        <button id="btnMoveS"  title="South">S</button>
        <span></span>
      </div>`;
    dock.appendChild(wrap);
  }

  const bind = (id, dx, dy) => {
    const b = q(id);
    if (!b) return;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const out = await API.move(dx, dy);
        if (out?.log) {
          const frames = out.log.map(t => ({ text: t, ts: Date.now() }));
          window.dispatchEvent(new CustomEvent('game:log', { detail: frames }));
          document.dispatchEvent(new CustomEvent('console:log', { detail: out.log.join('\n') }));
        }
      } catch (err) {
        document.dispatchEvent(new CustomEvent('console:log', { detail: String(err) }));
      } finally {
        b.disabled = false;
      }
    });
  };
  bind('#btnMoveN',  0, -1);
  bind('#btnMoveS',  0,  1);
  bind('#btnMoveW', -1,  0);
  bind('#btnMoveE',  1,  0);
}

// -------- Unified loadout refresh for UI panels --------
async function refreshLoadout() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;
    const dto = await API.loadout(characterId);
    document.dispatchEvent(new CustomEvent('loadout:updated', { detail: dto }));
  } catch (err) {
    console.warn('[client_v2] loadout refresh failed', err);
  }
}
window.addEventListener('character:ready', () => { refreshLoadout(); });

// -------- Autosave (kept minimal) --------
function startAutosave() {
  let timer = null;
  const run = async () => {
    try { await API.autosaveCharacter({ heartbeat: Date.now() }); } catch {}
    timer = setTimeout(run, 30000);
  };
  timer = setTimeout(run, 30000);
  window.addEventListener('beforeunload', () => timer && clearTimeout(timer));
}

// -------- Main boot --------
(async () => {
  const ok = await guardAuthAndCharacter();
  if (!ok) return;

  // Safe viewer init (works even if Viewer.init isn’t exported)
  try {
    if (typeof Viewer.init === 'function') {
      await Viewer.init('#canvas', '#overlayCanvasLite');
      Viewer.attachResize?.();
      Viewer.fit?.();
    } else {
      // minimal fallback: still lock frame + canvases
      lockViewerFrameEdgeToEdge();
    }
  } catch (err) {
    console.error('Viewer init failed', err);
    lockViewerFrameEdgeToEdge();
  }

  lockViewerFrameEdgeToEdge()


  const DEFAULT_SHARD_URL = '/static/public/shards/00089451_default.json';
  try {
    if (typeof Viewer.loadShard === 'function') {
      await Viewer.loadShard(DEFAULT_SHARD_URL);
    } else if (typeof window.loadShard === 'function') {
      await window.loadShard(DEFAULT_SHARD_URL);
    } else {
      // super-fallback: fetch and broadcast for a passive listener
      const r = await fetch(DEFAULT_SHARD_URL);
      const shard = await r.json();
      window.dispatchEvent(new CustomEvent('sv2:loadShard', { detail: { shard, url: DEFAULT_SHARD_URL } }));
    }
    // Refit once content is in
    try { Viewer.fit?.(); } catch {}
  } catch (err) {
    console.warn('Shard load failed', err);
  }

  // Always lock frame & disable wheel to satisfy “edge to edge, no zoom”
  lockViewerFrameEdgeToEdge();

  try {
    const state = await API.spawn();
    const pos = state?.player?.pos;
    if (Array.isArray(pos)) {
      Viewer.setPlayerPos?.(pos[0], pos[1]);
      Viewer.centerOnTile?.(pos[0], pos[1]);
      const cBtn = document.getElementById('btnCenter');
      if (cBtn) { cBtn.disabled = false; cBtn.title = 'Center on player'; }
    }
  } catch (err) {
    console.warn('Player spawn failed', err);
  }

  // HUD and actions
  try {
    if (document.querySelector('.room-stage')) {
    try {
      initActionHUD();
      updateActionHUD({ ready: true });
    } catch (err) {
      console.warn('Action HUD init failed', err);
    }
  } else {
    // We’re using #action-root + quick-actions on this page.
    // No HUD mount here—skip to custom wiring.
  }
  } catch (err) {
    console.warn('Action HUD init failed', err);
  }
  wireBaseActionButtons();
  ensureMoveButtons();

  // Initial hydrate for inventory/paperdoll
  refreshLoadout();
  startAutosave();
})();
