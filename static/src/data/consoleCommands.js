// Console commands: movement + camera + util
// Expects ctx = { canvas, shard, pixi, player, center }

import { movePlayerBy, setPlayerPosition } from '../state/playerState.js';

function centerOfCanvas(canvas) {
  return { x: (canvas?.width || 0) / 2, y: (canvas?.height || 0) / 2 };
}

export function handleConsoleCommand(text, ctx = {}) {
  const raw = (text || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const parts = lower.split(/\s+/);

  // ---- Help ----
  if (lower === 'help' || lower === '?') {
    return [
      'Commands:',
      '  help / ?           - this help',
      '  n|s|e|w [steps]    - move (aliases: north/south/east/west)',
      '  move <dir> [steps] - same as above',
      '  goto <x> <y>       - teleport on current shard',
      '  whereami           - report tile and shard',
      '  center             - center camera on player',
      '  zoom in|out        - zoom (wheel/drag also supported)',
      '  stats              - canvas + shard info',
      '  clear              - clear console',
    ].join('\n');
  }

  // ---- Clear ----
  if (lower === 'clear') return '__clear__';

  // ---- Movement (n/e/s/w or move north 3) ----
  const dirVec = {
    n: [0, -1], north: [0, -1],
    s: [0,  1], south: [0,  1],
    e: [1,  0], east:  [1,  0],
    w: [-1, 0], west:  [-1, 0],
  };

  if (dirVec[parts[0]]) {
    const [dx, dy] = dirVec[parts[0]];
    const steps = parts[1] && !isNaN(parts[1]) ? Math.max(1, parseInt(parts[1], 10)) : 1;
    for (let i = 0; i < steps; i++) movePlayerBy(dx, dy, ctx.shard);
    ctx.pixi?.setPlayer?.(ctx.player?.x, ctx.player?.y);
    return `Moved ${parts[0]} ${steps} step${steps > 1 ? 's' : ''}.`;
  }

  if (parts[0] === 'move' && dirVec[parts[1]]) {
    const [dx, dy] = dirVec[parts[1]];
    const steps = parts[2] && !isNaN(parts[2]) ? Math.max(1, parseInt(parts[2], 10)) : 1;
    for (let i = 0; i < steps; i++) movePlayerBy(dx, dy, ctx.shard);
    ctx.pixi?.setPlayer?.(ctx.player?.x, ctx.player?.y);
    return `Moved ${parts[1]} ${steps} step${steps > 1 ? 's' : ''}.`;
  }

  // ---- Goto ----
  if (parts[0] === 'goto' && parts[1] && parts[2]) {
    const x = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setPlayerPosition(x, y, ctx.shard);
      ctx.pixi?.setPlayer?.(ctx.player?.x, ctx.player?.y);
      return `Teleported to (${x}, ${y}).`;
    }
    return 'Usage: goto <x> <y>';
  }

  // ---- Where am I ----
  if (lower === 'whereami' || lower === 'pos' || lower === 'position') {
    const p = ctx.player || { x: 0, y: 0 };
    const sid = ctx.shard?.id || ctx.shard?.shardID || '?';
    return `You are at (${p.x}, ${p.y}) on shard ${sid}.`;
  }

  // ---- Center camera on player ----
  if (lower === 'center') {
    if (typeof ctx.center === 'function') {
      ctx.center();
      return 'Centered on player.';
    }
    return 'Center unavailable.';
  }

  // ---- Zoom + Stats ----
  if (lower === 'zoom in')  { const a = centerOfCanvas(ctx.canvas); ctx.pixi?.zoomInAt?.(a.x, a.y);  return 'Zoomed in.'; }
  if (lower === 'zoom out') { const a = centerOfCanvas(ctx.canvas); ctx.pixi?.zoomOutAt?.(a.x, a.y); return 'Zoomed out.'; }

  if (lower === 'stats') {
    const c = ctx.canvas;
    const s = ctx.shard;
    return `Canvas: ${c?.width || 0}x${c?.height || 0} | Shard: ${s?.id || '?'} ${s?.width || '?'}x${s?.height || '?'}`;
  }

  return `Unknown command: "${raw}". Type "help".`;
}
