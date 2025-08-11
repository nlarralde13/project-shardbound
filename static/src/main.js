// main.js — orchestrator (gameboard/console + map views)

import { togglePanel } from './ui/panels.js';
import { mountViewportHUD } from './ui/viewportHud.js';

import {
  goConsole, goShard, goSlice, goRoom,
  onViewportChange, getViewportState
} from './state/viewportState.js';

import { generateSlice } from './shards/generateSlice.js';
import { generateRoom }  from './shards/generateRoom.js';

import {
  getSelectedTile, getContext, swapContext,
  isMapMounted, isMapReady, mountMap,
  showMap, hideMap, pauseMap, resumeMap,
  refitAndRedraw, getShard, setShard
} from './ui/mapView.js';

import { applyZoom } from './ui/camera.js';

import {
  mountConsole, showConsole, hideConsole,
  appendLine, onCommand
} from './ui/consoleView.js';

import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';

import {
  initActionBar, renderActionBarFor, setActionProfile
} from './ui/actionMenu.js';

import {
  setDevMode, canSwapClass,
  getProfile, loadClass, onProfileChange
} from './state/playerProfile.js';

import { skillCatalog } from './data/skillCatalog.js';

/* ───────── helpers / logging ───────── */

const H = (id) => document.getElementById(id);
const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
};
const L = {
  main: (...a) => console.log(`[${now()}][main]`, ...a),
  ui:   (...a) => console.log(`[${now()}][ui]`,   ...a),
  fsm:  (...a) => console.log(`[${now()}][fsm]`,  ...a),
  map:  (...a) => console.log(`[${now()}][map]`,  ...a),
  h:    (...a) => console.log(`[${now()}][handlers]`, ...a),
  err:  (...a) => console.error(`[${now()}][ERROR]`, ...a),
};
const say = (msg) => appendLine(`${now()} ${msg}`);

function detectDev() {
  const q = new URLSearchParams(location.search);
  const val = q.get('dev') === '1' || localStorage.getItem('dev') === '1';
  L.main('detectDev →', val);
  return val;
}

function canvasCenter() {
  const c = H('viewport');
  return { x: (c?.width || 0) / 2, y: (c?.height || 0) / 2 };
}

/* remember last slice payload so room→slice and slice→shard work */
let __lastSlicePayload = null;

/* ───────── action handlers ───────── */
function buildActionHandlers() {
  return {
    console: () => {
      L.h('console() clicked; current =', getViewportState().current);
      goConsole();
    },

    back: () => {
      const { current } = getViewportState();
      L.h('back() clicked; current =', current, 'lastSlicePayload =', __lastSlicePayload);
      if (current === 'room') {
        if (__lastSlicePayload) goSlice(__lastSlicePayload);
      } else if (current === 'slice') {
        goShard();
      }
    },

    explore: () => {
      const { current } = getViewportState();
      const t = getSelectedTile?.();
      L.h('explore() clicked; current =', current, 'tile =', t);
      if (!t) { say('Select a tile to explore.'); return; }

      if (current === 'shard') {
        const { sid } = getContext() || { sid: 's0_0' };
        const slice = generateSlice({ sid, center: { tx: t.x, ty: t.y } });
        __lastSlicePayload = { sid, slice };
        goSlice(__lastSlicePayload);
      } else if (current === 'slice') {
        const { sid } = getContext() || { sid: 's0_0' };
        const room = generateRoom({ sid, tx: t.x, ty: t.y, kind: t.kind, name: t.name });
        goRoom({ sid, room });
      } else {
        say('Nothing to explore here.');
      }
    },

    __skill__: (def) => {
      appendLine(`You used ${def.label || def.id}.`);
    }
  };
}

/* ───────── boot ───────── */

window.addEventListener('DOMContentLoaded', async () => {
  L.main('DOMContentLoaded');
  setDevMode(detectDev());

  document.querySelectorAll('.panel-toggle').forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) {
      const ic = document.createElement('span');
      ic.className = 'toggle-icon'; ic.textContent = '+';
      btn.appendChild(ic);
    }
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => togglePanel(targetId));
  });

  // Console on first load
  mountConsole('#mapViewer');
  showConsole();

  // Hide legacy chat area if present
  const legacy = H('chatContainer');
  if (legacy) legacy.style.display = 'none';

  // Make sure wrapper is hidden initially
  const vw = H('viewportWrapper');
  if (vw) vw.style.display = 'none';

  mountViewportHUD('#mapViewer');

  // Action bar
  const profile = getProfile();
  setActionProfile(profile);
  initActionBar({
    container: '#actionBar',
    playerProfile: profile,
    state: 'console',
    on: buildActionHandlers(),
  });

  onProfileChange((p) => {
    setActionProfile(p);
    renderActionBarFor(getViewportState().current, { on: buildActionHandlers() });
    say(`Class loaded: ${p.name}. HP:${p.stats.hp} MP:${p.stats.mp} SP:${p.stats.sp}`);
  });

  // Console commands
  onCommand((cmd) => {
    const text = cmd.trim();
    const lower = text.toLowerCase();

    if (lower === 'help') {
      return [
        'Commands:',
        '  map            → open the map',
        '  console        → return to gameboard',
        '  skills         → list your skills',
        '  stats          → show HP/MP/SP',
        '  class <id>     → (dev only) switch class',
        'Classes: fighter, mage, paladin, cleric, rogue, druid, ranger',
      ].join('\n');
    }
    if (lower === 'map')     { goShard();   return 'Opening map…'; }
    if (lower === 'console') { goConsole(); return 'Back to gameboard.'; }

    if (lower === 'skills') {
      const p = getProfile();
      const lines = (p.skills || []).map(id => `  • ${skillCatalog[id]?.name || id}`);
      return lines.length ? ['Skills:', ...lines].join('\n') : 'No skills learned.';
    }
    if (lower === 'stats') {
      const { hp, mp, sp } = getProfile().stats;
      return `HP:${hp}  MP:${mp}  SP:${sp}`;
    }
    if (lower.startsWith('class ')) {
      const id = lower.split(/\s+/)[1];
      if (!canSwapClass()) return 'Class swapping is disabled.';
      try { loadClass(id); return `Class switched to ${getProfile().name}.`; }
      catch { return `Unknown class "${id}". Try: fighter, mage, paladin, cleric, rogue, druid, ranger.`; }
    }
    return null;
  });

  // Start in console
  goConsole();

  // Router
  onViewportChange(async ({ current, payload }) => {
    L.fsm('onViewportChange →', current, 'payload:', payload);

    if (current === 'console') {
      hideMap(); pauseMap(); showConsole();
      renderActionBarFor('console', { on: buildActionHandlers() });
      return;
    }

    // map views
    hideConsole();
    showMap();                                    // make wrapper visible
    await new Promise(r => requestAnimationFrame(r));

    if (!isMapMounted()) {
      L.map('mountMap → start');
      await mountMap('#mapViewer', { autoload: true });
    }
    if (!isMapReady()) {
      L.map('mountMap (again)');
      await mountMap('#mapViewer', { autoload: true });
    }

    if (current === 'shard') {
      let s = getShard();
      // if autoload hadn’t finished before, get it after mount
      if (!s) { await new Promise(r => requestAnimationFrame(r)); s = getShard(); }

      L.map('swapContext → shard', { sid: s?.id || 's0_0', hasData: !!s });
      swapContext({ type: 'shard', sid: s?.id || 's0_0', data: s, keepCamera: false });

      await new Promise(r => requestAnimationFrame(r));
      refitAndRedraw();
      const { x, y } = canvasCenter();
      applyZoom(1.0, x, y);
    }

    if (current === 'slice') {
      const { sid, slice } = payload || {};
      __lastSlicePayload = payload || null;
      L.map('swapContext → slice', { sid, hasSlice: !!slice });
      swapContext({ type:'slice', sid, data: slice, keepCamera:false });

      await new Promise(r => requestAnimationFrame(r));
      refitAndRedraw();
      const { x, y } = canvasCenter();
      applyZoom(2.0, x, y);
    }

    if (current === 'room') {
      const { sid, room } = payload || {};
      L.map('swapContext → room', { sid, hasRoom: !!room });
      swapContext({ type:'room', sid, data: room, keepCamera:false });

      await new Promise(r => requestAnimationFrame(r));
      refitAndRedraw();
      const { x, y } = canvasCenter();
      applyZoom(3.0, x, y);
    }

    resumeMap();
    renderActionBarFor(current, { on: buildActionHandlers() });
  });

  // Dev: save/load/regen
  H('saveShard')?.addEventListener('click', () => {
    if (!isMapReady()) return say('[dev] save ignored: map not ready');
    saveShard(getShard()); say('Shard saved.');
  });

  H('loadShardBtn')?.addEventListener('click', () => H('loadShardInput')?.click());
  H('loadShardInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const s = await loadShardFromFile(f); setShard(s); say('Shard loaded.'); }
    catch (err) { say(`[dev] Load shard failed: ${err?.message || err}`); }
    finally { e.target.value = ''; }
  });

  H('regenWorld')?.addEventListener('click', async () => {
    try { const s = await regenerateShard({}); setShard(s); say('Shard regenerated.'); }
    catch (err) { say(`[dev] Regen failed: ${err?.message || err}`); }
  });

  // quick toggle with 'm'
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
      const visible = (H('viewportWrapper')?.style.display !== 'none');
      visible ? goConsole() : goShard();
    }
  });

  L.main('Boot complete');
});
