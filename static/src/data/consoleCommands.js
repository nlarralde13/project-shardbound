// /static/src/data/consoleCommands.js
import { applyZoom, getZoomLevel } from '../ui/camera.js';

function centerOfCanvas() {
  const c = document.getElementById('viewport');
  return { x: (c?.width || 0) / 2, y: (c?.height || 0) / 2 };
}

export function handleConsoleCommand(text, ctx = {}) {
  const raw = (text || '').trim();
  if (!raw) return '';

  const t = raw.toLowerCase();

  if (t === 'help') {
    return [
      'Commands:',
      '  help          - this help',
      '  zoom in/out   - change zoom',
      '  stats         - canvas + shard info',
      '  center        - center view',
      '  clear         - clear console'
    ].join('\n');
  }

  if (t === 'clear') {
    const logEl = document.getElementById('consoleLog');
    if (logEl) logEl.innerHTML = '';
    return 'Console cleared.';
  }

  if (t.startsWith('zoom ')) {
    const dir = t.split(/\s+/)[1];
    const delta = dir === 'in' ? 0.1 : dir === 'out' ? -0.1 : 0;
    if (!delta) return 'Use "zoom in" or "zoom out".';
    const { x, y } = centerOfCanvas();
    applyZoom(getZoomLevel() + delta, x, y);
    return `Zoom set to ${Math.round(getZoomLevel() * 100)}%.`;
  }

  if (t === 'center') {
    const { x, y } = centerOfCanvas();
    applyZoom(getZoomLevel(), x, y);
    return 'Centered on view.';
  }

  if (t === 'stats') {
    const c = document.getElementById('viewport');
    const s = ctx.shard;
    return `Canvas: ${c?.width || 0}x${c?.height || 0} | Shard: ${s?.id || '?'} ${s?.width || '?'}x${s?.height || '?'}`;
  }

  // Always acknowledge unknown commands
  return `Unknown command: "${raw}". Type "help".`;
}
