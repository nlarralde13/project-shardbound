// Orchestration: Gameboard-first. Routes Console ↔ Map via viewportState.
// Uses mapView for map lifecycle; gameboard (consoleView) owns chat & commands.

import { togglePanel } from './ui/panels.js';
import { mountViewportHUD } from './ui/viewportHud.js';
import { onViewportChange, goConsole, goWorld } from './state/viewportState.js';

import {
  mountMap,
  pauseMap,
  resumeMap,
  hideMap,
  showMap,
  isMapMounted,
  isMapReady,
  getShard,
  setShard,
  refitAndRedraw
} from './ui/mapView.js';

import {
  mountConsole,
  showConsole,
  hideConsole,
  appendLine,
  onCommand
} from './ui/consoleView.js';

import { saveShard, loadShardFromFile, regenerateShard } from './shards/shardLoader.js';

const PLAYER = 'Player1';

// Simple helper to prefix time
function timestamped(msg) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${msg}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  // Panel toggles
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    if (!btn.querySelector('.toggle-icon')) {
      const icon = document.createElement('span');
      icon.className = 'toggle-icon';
      icon.textContent = '+';
      btn.appendChild(icon);
    }
    const targetId = btn.dataset.target;
    btn.addEventListener('click', () => togglePanel(targetId));
  });

  // Mount Gameboard (console) — this is our chat + command surface
  mountConsole('#mapViewer');
  showConsole();

  // Wire action buttons to Gameboard log
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.onclick = () => appendLine(timestamped(`${PLAYER} used ${btn.dataset.action || btn.title}`));
  });

  // If old #chatContainer exists in the DOM, hide it (we replaced it)
  const legacyChat = document.getElementById('chatContainer');
  if (legacyChat) legacyChat.style.display = 'none';

  // Ensure map stage starts hidden
  const vw = document.getElementById('viewportWrapper');
  if (vw) vw.style.display = 'none';

  // HUD (Map button + action row)
  mountViewportHUD('#mapViewer');

  // Commands on the Gameboard
  onCommand((cmd) => {
    const c = cmd.trim().toLowerCase();
    if (c === 'help') {
      return [
        'Commands:',
        '  map      → open the world map',
        '  console  → return to gameboard',
        '  where    → where am I?',
        '  look     → look around'
      ].join('\n');
    }
    if (c === 'map')    { goWorld();  return 'Opening map…'; }
    if (c === 'console'){ goConsole(); return 'Back to gameboard.'; }
    if (c === 'where')  return 'You are in the Guild Hall.';
    if (c === 'look')   return 'A warm hearth, a notice board, and a world waiting.';
    return null; // already echoed as "> cmd"
  });

  // Start in console view (Gameboard visible, Map hidden/paused)
  goConsole();

  // View router
  onViewportChange(async ({ current }) => {
    if (current === 'console') {
      // Gameboard only
      showConsole();
      hideMap();
      pauseMap();
      return;
    }

    // Map-only (world/region/minishard share the map stage)
    hideConsole();

    if (!isMapMounted()) {
      await mountMap('#mapViewer', { autoload: true });
    } else {
      showMap();                     // unhide first so sizing is correct
      if (!isMapReady()) await mountMap('#mapViewer', { autoload: true });
      else refitAndRedraw();
    }
    resumeMap();
  });

  // Dev tools
  document.getElementById('saveShard')?.addEventListener('click', () => {
    if (!isMapReady()) return appendLine(timestamped('[dev] save ignored: map not ready'));
    saveShard(getShard());
    appendLine(timestamped('Shard saved.'));
  });

  document.getElementById('loadShardBtn')?.addEventListener('click', () =>
    document.getElementById('loadShardInput')?.click()
  );

  document.getElementById('loadShardInput')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const newShard = await loadShardFromFile(f);
      setShard(newShard);
      appendLine(timestamped('Shard loaded.'));
    } catch (err) {
      appendLine(timestamped(`[dev] Load shard failed: ${err?.message || err}`));
      console.error(err);
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('regenWorld')?.addEventListener('click', async () => {
    try {
      const newShard = await regenerateShard({});
      setShard(newShard);
      appendLine(timestamped('Shard regenerated.'));
    } catch (err) {
      appendLine(timestamped(`[dev] Regen failed: ${err?.message || err}`));
      console.error(err);
    }
  });

  // Quick keyboard toggle (M) between console and world
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
      const mapVisible = (document.getElementById('viewportWrapper')?.style.display !== 'none');
      mapVisible ? goConsole() : goWorld();
    }
  });

  // Debug helpers
  window.__append = appendLine;
});
