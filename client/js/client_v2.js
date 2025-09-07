// Import read-only shard viewer (no editing or draft handlers)
import * as Viewer from './shard-viewer-lite.js';
import { API } from '/static/js/api.js';
import { initActionHUD, updateActionHUD } from './actionHud.js';
import { mountConsole, print as consolePrint } from '/static/src/console/consoleUI.js';
import { parse } from '/static/src/console/parse.js';
import { dispatch } from '/static/src/console/dispatch.js';

// ----- simple helpers -----


const log = (text, type = 'log') => {
  window.dispatchEvent(
    new CustomEvent('game:log', { detail: [{ text, type, ts: Date.now() }] })
  );
};
const clampPct = (v) => Math.max(0, Math.min(100, v));

// Preload item catalog so the overlay can resolve icons/tooltips (MVP3 parity)
async function preloadCatalog() {
  try {
    const res = await fetch('/static/public/api/catalog.json', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      window.__itemCatalog = await res.json();
      window.dispatchEvent(new CustomEvent('catalog:loaded', {
        detail: { count: Array.isArray(window.__itemCatalog) ? window.__itemCatalog.length : 0 }
      }));
    }
  } catch (_) {}
}


// ----- shard viewer wiring (read‑only) -----
const viewerLoad = Viewer.loadShard || window.loadShard;
async function loadShardClient(url) {
  if (typeof viewerLoad === 'function') {
    return viewerLoad(url);
  }
  const res = await fetch(url);
  const shard = await res.json();
  window.dispatchEvent(
    new CustomEvent('sv2:loadShard', { detail: { shard, url } })
  );
  return shard;
}
window.loadShard = loadShardClient;

// Load a default shard immediately so the map is visible on page load
const DEFAULT_SHARD_URL = '/static/public/shards/00089451_default.json';

// Apply a 50px default scale so the map isn't tiny on load
Viewer.setScalePx?.(50);

loadShardClient(DEFAULT_SHARD_URL).then(() => {
  Viewer.fitToFrame?.();
}).catch(() => {});

// ----- console bootstrap -----
const consoleUI = mountConsole(document.getElementById('console-root'), {
  onSubmit: async (line, ctx = {}) => {
    const parsed = parse(line);
    if (parsed?.error) {
      return [{ type: 'text', data: `Error: ${parsed.error.message}` }];
    }
    const frames = await dispatch(
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
    return Array.isArray(frames) ? frames : [];
  }
});

window.addEventListener('game:log', (ev) => {
  const events = ev.detail || [];
  for (const e of events) {
    const mode = e.type && e.type !== 'log' ? 'system' : 'normal';
    consolePrint(e.text || String(e), { mode });
  }
});

// ----- sidebar collapse -----
const sidebar = document.getElementById('clientSidebar');
const btnSidebarCollapse = document.getElementById('btnSidebarCollapse');
btnSidebarCollapse?.addEventListener('click', () => {
  const collapsed = sidebar?.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  if (btnSidebarCollapse) btnSidebarCollapse.textContent = collapsed ? '▶' : '◀';
});

function ensureSidebarVisible() {
  if (!sidebar) return;
  if (sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    document.body.classList.remove('sidebar-collapsed');
    if (btnSidebarCollapse) btnSidebarCollapse.textContent = '◀';
  }
}

const isTyping = (t) => {
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const disallowed = ['checkbox','radio','button','range','submit','reset','file','color'];
    return !disallowed.includes((t.type || '').toLowerCase());
  }
  return t.isContentEditable === true;
};

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target)) return;
  const k = e.key?.toLowerCase();
  if (k === 'c') {
    e.preventDefault();
    ensureSidebarVisible();
    document.getElementById('cardCharacter')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (k === 'i') {
    e.preventDefault();
    ensureSidebarVisible();
    document.getElementById('cardInventory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ----- action HUD -----
initActionHUD({ mount: document.getElementById('action-root') });

// Track current position for autosave
let CurrentPos = { x: 0, y: 0 };
let CurrentShardId = '';
window.CurrentPos = CurrentPos;
window.CurrentShardId = CurrentShardId;
const autoCenterOnMove = false;
let hasCenteredOnce = false;
window.addEventListener('game:moved', (ev) => {
  const d = ev.detail || {};
  if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
    CurrentPos = { x: d.x, y: d.y };
    window.CurrentPos = CurrentPos;
    Viewer.setPlayerPos?.(d.x, d.y);
    const btnCenter = document.getElementById('btnCenter');
    if (btnCenter && btnCenter.disabled) {
      btnCenter.disabled = false;
      btnCenter.title = 'Center on player';
    }
    if (autoCenterOnMove) Viewer.centerOnTile?.(d.x, d.y);
  }
});

function updateCharHUD(p = {}) {
  const hp = document.getElementById('statHP');
  const mp = document.getElementById('statMP');
  const sta = document.getElementById('statSTA');
  const hunger = document.getElementById('statHunger');
  if (hp && Number.isFinite(p.hp) && Number.isFinite(p.max_hp)) {
    hp.style.width = clampPct((p.hp / p.max_hp) * 100) + '%';
  }
  if (mp && Number.isFinite(p.mp) && Number.isFinite(p.max_mp)) {
    mp.style.width = clampPct((p.mp / p.max_mp) * 100) + '%';
  }
  if (sta && Number.isFinite(p.sta) && Number.isFinite(p.max_sta)) {
    sta.style.width = clampPct((p.sta / p.max_sta) * 100) + '%';
  }
  if (hunger && Number.isFinite(p.hunger)) {
    hunger.textContent = `Hunger: ${p.hunger}`;
  }
}
window.updateCharHud = updateCharHUD;

// ----- action rail handlers -----
const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);

bind('btnLook', async () => {
  log('You look around.');
  try {
    const st = await API.state();
    if (st?.room?.description) log(st.room.description);
    if (st?.interactions) updateActionHUD({ interactions: st.interactions });
  } catch (e) {
    log('Nothing special here.');
  }
});

bind('btnInteract', async () => {
  try {
    const out = await API.interact();
    if (Array.isArray(out?.log)) {
      for (const t of out.log) log(t);
    }
    if (out?.interactions) updateActionHUD({ interactions: out.interactions });
  } catch (e) {
    log('Nothing to interact with.');
  }
});

bind('btnRest', async () => {
  try {
    const out = await API.action('rest');
    if (Array.isArray(out?.events)) {
      window.dispatchEvent(
        new CustomEvent('game:log', {
          detail: out.events.map((e) => ({
            text: e.text || String(e),
            ts: e.ts || Date.now()
          }))
        })
      );
    }
    if (out?.player) updateCharHUD(out.player);
  } catch (e) {
    log('Rest failed.');
  }
});

bind('btnSkill1', () => log('Not implemented.'));
bind('btnSkill2', () => log('Not implemented.'));
bind('btnCenter', () => {
  if (Number.isFinite(CurrentPos.x) && Number.isFinite(CurrentPos.y)) {
    Viewer.centerOnTile?.(CurrentPos.x, CurrentPos.y);
  }
});

// ---- Auth + active character guard ----
async function guardAuthAndCharacter() {
  const u = await API.me().catch(() => null);
  if (!u) { location.href = '/'; return null; }
  document.getElementById('userHandle')?.replaceChildren(document.createTextNode(u.handle || u.email || ''));
  document.getElementById('userBadge')?.classList.remove('hidden');
  const devLink = document.getElementById('linkDevTools');
  if (devLink) {
    const acl = String(u.acl || '').toLowerCase();
    if (['admin','owner','super','root'].includes(acl)) devLink.style.display = '';
    else devLink.remove();
  }

  const c = await API.characterActive().catch(() => null);
  if (!c) { location.href = '/characters'; return null; }

  window.__currentUser = u;
  window.__activeCharacter = c;
  try { window.dispatchEvent(new CustomEvent('character:ready', { detail: c })); } catch {}
  return { u, c };
}

document.getElementById('btnLogout')?.addEventListener('click', async () => {
  try { await API.logout(); } catch {}
  location.href = '/';
});

window.addEventListener('equipment:changed', () => {
  try { refreshInventoryOverlay(true); } catch {}
});

// ---- Autosave ----
function startAutosave() {
  setInterval(async () => {
    const pos = window.CurrentPos || {};
    const shard = window.CurrentShardId || null;
    const state = {};
    try {
      await API.autosaveCharacter({ shard_id: shard, x: pos.x ?? null, y: pos.y ?? null, state });
    } catch {}
  }, 60000);
}

// ----- boot -----
(async () => {
  const ok = await guardAuthAndCharacter();
  if (!ok) return;

  await preloadCatalog();


  let st;
  try {
    st = await API.state();
  } catch {
    const DEV = new URLSearchParams(location.search).has('devmode');
    await API.spawn({ devmode: DEV });
    st = await API.state();
  }
  const pos = st.player?.pos || [];
  if (pos.length === 2) {
    CurrentPos = { x: pos[0], y: pos[1] };
    window.CurrentPos = CurrentPos;
    Viewer.setPlayerPos?.(pos[0], pos[1]);
    window.dispatchEvent(new CustomEvent('game:moved', { detail: CurrentPos }));
    log(`Player at (${pos[0]}, ${pos[1]})`);
  }
  CurrentShardId = st.room?.shard_id || st.shard_id || '';
  window.CurrentShardId = CurrentShardId;
  if (st.room?.shard_url) {
    await loadShardClient(st.room.shard_url);
    Viewer.fitToFrame?.();
  }
  if (!hasCenteredOnce && Number.isFinite(CurrentPos.x) && Number.isFinite(CurrentPos.y)) {
    Viewer.centerOnTile?.(CurrentPos.x, CurrentPos.y);
    hasCenteredOnce = true;
  }
  window.currentRoom = st.room;
  window.patchRoom?.(st.room);
  updateActionHUD({ interactions: st.interactions });
  updateCharHUD(st.player);
  
  if (Array.isArray(st.log)) {
    window.dispatchEvent(
      new CustomEvent('game:log', {
        detail: st.log.map((t) => ({ text: t, ts: Date.now() }))
      })
    );
  }
  startAutosave();
})();

export { loadShardClient as loadShard };
