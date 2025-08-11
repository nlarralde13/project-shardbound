// main.js — Orchestrator with detailed logging (Map/Console lifecycle + Action bar + Dev commands)

import { togglePanel } from './ui/panels.js';
import { mountViewportHUD } from './ui/viewportHud.js';
import { getViewportState, onViewportChange, goConsole, goWorld, goMiniShard } from './state/viewportState.js';

import {
  mountMap, pauseMap, resumeMap, hideMap, showMap,
  isMapMounted, isMapReady, getShard, setShard, refitAndRedraw,
  getSelectedTile,
} from './ui/mapView.js';

import {
  mountConsole, showConsole, hideConsole, appendLine, onCommand,
} from './ui/consoleView.js';

import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';

import {
  initActionBar, renderActionBarFor, setActionProfile,
} from './ui/actionMenu.js';

import {
  setDevMode, canSwapClass,
  getProfile, loadClass, onProfileChange,
} from './state/playerProfile.js';

import { skillCatalog } from './data/skillCatalog.js';

/* ──────────────────────────────────────────────────────────────
 * Logging helpers
 * ────────────────────────────────────────────────────────────── */
const H = (id) => document.getElementById(id);
const stamp = () => {
  const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
};
const L = {
  main: (...a) => console.log(`[${stamp()}][main]`, ...a),
  fsm:  (...a) => console.log(`[${stamp()}][fsm]`,  ...a),
  map:  (...a) => console.log(`[${stamp()}][map]`,  ...a),
  ui:   (...a) => console.log(`[${stamp()}][ui]`,   ...a),
  act:  (...a) => console.log(`[${stamp()}][actions]`, ...a),
  dev:  (...a) => console.log(`[${stamp()}][devtools]`, ...a),
  err:  (...a) => console.error(`[${stamp()}][ERROR]`, ...a),
};
const say = (txt) => appendLine(`${stamp()} ${txt}`);

function snapshot(label = 'snapshot') {
  try {
    const vw = H('viewportWrapper');
    const cv = H('consoleView');
    const canvas = H('viewport');
    const s = {
      label,
      viewportState: getViewportState()?.current,
      wrapperDisplay: vw ? getComputedStyle(vw).display : '(no wrapper)',
      wrapperStyleDisplay: vw?.style?.display,
      wrapperW: vw?.clientWidth, wrapperH: vw?.clientHeight,
      canvasW: canvas?.width,    canvasH: canvas?.height,
      mapMounted: safeCall(isMapMounted, false),
      mapReady:   safeCall(isMapReady, false),
      consoleDisplay: cv ? getComputedStyle(cv).display : '(no console)',
    };
    L.ui('SNAPSHOT →', s);
    return s;
  } catch (e) {
    L.err('snapshot failed', e);
  }
}

function safeCall(fn, fallback) {
  try { return typeof fn === 'function' ? fn() : fallback; }
  catch { return fallback; }
}

/* Ensure wrapper visibility matches current view (CSS expects flex) */
function setMapWrapperVisible(show) {
  const el = H('viewportWrapper');
  if (!el) { L.ui('setMapWrapperVisible: wrapper not found'); return; }
  const before = getComputedStyle(el).display;
  el.style.display = show ? 'flex' : 'none';
  const after = getComputedStyle(el).display;
  L.ui(`setMapWrapperVisible(${show}) display: ${before} → ${after}`, { w: el.clientWidth, h: el.clientHeight });
}

/* Dev flag from query or localStorage */
function detectDev() {
  const q = new URLSearchParams(location.search);
  const qDev = q.get('dev');
  const lsDev = localStorage.getItem('dev');
  const val = (qDev === '1' || lsDev === '1');
  L.main('detectDev →', val, `(query:${qDev}) (ls:${lsDev})`);
  return val;
}

/* Action handlers for the action bar */
function buildActionHandlers() {
  return {
    console: () => { L.act('Console clicked'); goConsole(); },
    explore: () => {
      const t = getSelectedTile?.();
      if (!t) { L.act('Explore clicked (no tile)'); return say('Select a tile to explore.'); }
      L.act('Explore clicked', t);
      say(`Exploring tile (${t.x}, ${t.y})…`);
      goMiniShard?.({ parentTile: t });
    },
    __skill__: (def) => {
      const name = skillCatalog[def.id]?.name || def.label || def.id;
      L.act('Skill used', def.id, name);
      say(`${getProfile().name} used ${name}.`);
    },
  };
}

/* ──────────────────────────────────────────────────────────────
 * Boot
 * ────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  L.main('DOMContentLoaded');

  // Panel toggles
  const toggles = document.querySelectorAll('.panel-toggle');
  L.ui(`panel toggles found: ${toggles.length}`);
  toggles.forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) {
      const icon = document.createElement('span'); icon.className = 'toggle-icon'; icon.textContent = '+';
      btn.appendChild(icon);
    }
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => { L.ui('panel toggle', targetId); togglePanel(targetId); });
  });

  // Dev mode
  setDevMode(detectDev());

  // Gameboard (console)
  L.main('mountConsole → start');
  mountConsole('#mapViewer');
  showConsole();
  L.main('mountConsole → done');
  snapshot('after console mount');

  // Hide legacy chat container if present
  if (H('chatContainer')) {
    H('chatContainer').style.display = 'none';
    L.ui('legacy chatContainer hidden');
  }

  // Map starts hidden
  setMapWrapperVisible(false);

  // HUD (Map toggle)
  mountViewportHUD('#mapViewer');
  

  // Load saved profile (or default) and sync action bar
  const profile = getProfile();
  L.main('profile loaded', profile);
  setActionProfile(profile);

  L.main('initActionBar → start');
  initActionBar({
    container: '#actionBar',
    playerProfile: profile,
    state: 'console',
    on: buildActionHandlers(),
  });
  L.main('initActionBar → done');

  // Re-render action bar when the profile changes
  onProfileChange((p) => {
    L.main('onProfileChange', p);
    setActionProfile(p);
    const { current } = getViewportState();
    renderActionBarFor(current);
    say(`Class loaded: ${p.name}. HP:${p.stats.hp} MP:${p.stats.mp} SP:${p.stats.sp}`);
  });

  // Console commands
  onCommand((cmd) => {
    const text = cmd.trim();
    const lower = text.toLowerCase();
    L.ui('command', text);

    if (lower === 'help') {
      return [
        'Commands:',
        '  map            → open the world map',
        '  console        → return to gameboard',
        '  skills         → list your skills',
        '  stats          → show HP/MP/SP',
        '  class <id>     → (dev only) switch class',
        'Classes: fighter, mage, paladin, cleric, rogue, druid, ranger',
      ].join('\n');
    }

    if (lower === 'map')     { goWorld();   return 'Opening map…'; }
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
      try {
        loadClass(id);
        return `Class switched to ${getProfile().name}.`;
      } catch (e) {
        return `Unknown class "${id}". Try: fighter, mage, paladin, cleric, rogue, druid, ranger.`;
      }
    }

    return null; // already echoed by consoleView
  });

  // Start in console view
  L.fsm('goConsole() (boot)');
  goConsole();

  // View router (one set visible)
  onViewportChange(async ({ current }) => {
    L.fsm('onViewportChange →', current);
    snapshot(`before ${current}`);

    if (current === 'console') {
      L.map('→ console branch: hide map, pause, show console');
      setMapWrapperVisible(false);
      try { hideMap(); }  catch (e) { L.err('hideMap failed', e); }
      try { pauseMap(); } catch (e) { L.err('pauseMap failed', e); }

      showConsole();
      renderActionBarFor('console');
      snapshot('after console branch');
      return;
    }

    // Map views (world/region/minishard)
    L.map('→ map branch: hide console, unhide wrapper, mount/refit');
    hideConsole();

    // Unhide wrapper FIRST so client sizes are non-zero
    setMapWrapperVisible(true);
    try { showMap(); } catch (e) { L.err('showMap failed', e); }
    snapshot('after showMap + unhide wrapper');

    try {
      const mounted = safeCall(isMapMounted, false);
      const ready   = safeCall(isMapReady, false);
      L.map('isMapMounted?', mounted, 'isMapReady?', ready);

      if (!mounted) {
        L.map('mountMap → start');
        await mountMap('#mapViewer', { autoload: true });
        L.map('mountMap → done');
      } else if (!ready) {
        L.map('mountMap (not ready) → start');
        await mountMap('#mapViewer', { autoload: true });
        L.map('mountMap (not ready) → done');
      } else {
        // After visibility change, give layout a tick then refit
        L.map('refitAndRedraw → rAF tick');
        await new Promise(r => requestAnimationFrame(r));
        refitAndRedraw();
        L.map('refitAndRedraw → done');
      }
    } catch (err) {
      L.err('mount/refit failed', err);
    }

    try { resumeMap(); } catch (e) { L.err('resumeMap failed', e); }
    renderActionBarFor(current);
    snapshot(`after ${current} branch`);
  });

  // Dev tools
  H('saveShard')?.addEventListener('click', () => {
    L.dev('Save shard clicked');
    if (!safeCall(isMapReady, false)) return say('[dev] save ignored: map not ready');
    saveShard(getShard());
    say('Shard saved.');
  });

  H('loadShardBtn')?.addEventListener('click', () => {
    L.dev('Load shard clicked (button)');
    H('loadShardInput')?.click();
  });

  H('loadShardInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    L.dev('Load shard input change', f?.name);
    if (!f) return;
    try {
      const newShard = await loadShardFromFile(f);
      setShard(newShard);
      say('Shard loaded.');
    } catch (err) {
      say(`[dev] Load shard failed: ${err?.message || err}`);
      L.err('loadShardFromFile failed', err);
    } finally {
      e.target.value = '';
    }
  });

  H('regenWorld')?.addEventListener('click', async () => {
    L.dev('Regenerate shard clicked');
    try {
      const newShard = await regenerateShard({});
      setShard(newShard);
      say('Shard regenerated.');
    } catch (err) {
      say(`[dev] Regen failed: ${err?.message || err}`);
      L.err('regenerateShard failed', err);
    }
  });

  // Quick keyboard toggle (M)
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
      const mapVisible = (H('viewportWrapper')?.style.display !== 'none');
      L.ui('Key[M] →', mapVisible ? 'console' : 'world');
      mapVisible ? goConsole() : goWorld();
    }
  });

  // Handy global for quick inspection
  window.__sbSnapshot = snapshot;
  L.main('Boot complete');
});
