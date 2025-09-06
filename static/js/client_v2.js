import * as Viewer from './shard-viewer-v2.js';
import { API, autosaveCharacterState } from './api.js';
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

// ----- sidebar toggle -----
const sidebar = document.getElementById('clientSidebar');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
btnSidebarToggle?.addEventListener('click', () => {
  sidebar?.classList.toggle('is-collapsed');
});

// ----- action HUD -----
initActionHUD({ mount: document.getElementById('action-root') });

// Track current position for autosave
let CurrentPos = { x: 0, y: 0 };
let CurrentShardId = '';
window.addEventListener('game:moved', (ev) => {
  const d = ev.detail || {};
  if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
    CurrentPos = { x: d.x, y: d.y };
  }
});

function updateCharHUD(p = {}) {
  const hp = document.getElementById('statHP');
  const mp = document.getElementById('statMP');
  if (hp && Number.isFinite(p.hp) && Number.isFinite(p.max_hp)) {
    hp.style.width = clampPct((p.hp / p.max_hp) * 100) + '%';
  }
  if (mp && Number.isFinite(p.mp) && Number.isFinite(p.max_mp)) {
    mp.style.width = clampPct((p.mp / p.max_mp) * 100) + '%';
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

// ----- boot -----
(async () => {
  let st;
  try {
    st = await API.state();
  } catch {
    await API.spawn();
    st = await API.state();
  }
  const pos = st.player?.pos || [];
  if (pos.length === 2) {
    CurrentPos = { x: pos[0], y: pos[1] };
    window.dispatchEvent(
      new CustomEvent('game:moved', { detail: CurrentPos })
    );
  }
  CurrentShardId = st.room?.shard_id || st.shard_id || '';
  if (st.room?.shard_url) await loadShardClient(st.room.shard_url);
  updateActionHUD({ interactions: st.interactions });
  updateCharHUD(st.player);
  if (Array.isArray(st.log)) {
    window.dispatchEvent(
      new CustomEvent('game:log', {
        detail: st.log.map((t) => ({ text: t, ts: Date.now() }))
      })
    );
  }
  setInterval(() => {
    autosaveCharacterState({
      shard_id: CurrentShardId,
      x: CurrentPos.x,
      y: CurrentPos.y
    }).catch(() => {});
  }, 60000);
})();

export { loadShardClient as loadShard };
