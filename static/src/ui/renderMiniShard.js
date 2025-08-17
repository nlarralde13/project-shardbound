// Simple 4×4 mini-shard overlay renderer for MVP1.
// Renders rooms, shows mobs/resources counts, and lets you mark a room "cleared".
import { markRoomCleared } from "../slices/generateMiniShard.js"; // optional if you want to reuse; else import from state
import { setRoomState, getRoomState } from "../state/roomState.js";
import { openCombatOverlay } from "./combatOverlay.js";

export function openMiniShardOverlay({ parent, shardId, tileX, tileY, biome, worldSeed, mini }) {
  // Build overlay container
  const wrap = document.createElement('div');
  wrap.className = 'miniOverlay';
  wrap.innerHTML = `
    <div class="miniPanel">
      <div class="miniHeader">
        <div class="title">Explore — ${biome} (Tile ${tileX},${tileY})</div>
        <div class="spacer"></div>
        <button class="btnClose" title="Close (Exit)">Exit</button>
      </div>
      <canvas class="miniCanvas" width="512" height="512"></canvas>
      <div class="miniLegend">
        <span><b>M</b>=mobs, <b>R</b>=resources, click a room to toggle "cleared".</span>
      </div>
    </div>
  `;
  parent.appendChild(wrap);

  const canvas = wrap.querySelector('.miniCanvas');
  const ctx = canvas.getContext('2d');

  // Scale to fit panel (CSS controls size; canvas is HiDPI-safe)
  function fitHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 512;
    const cssH = canvas.clientHeight || 512;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }

  // Render rooms
  function draw() {
    fitHiDPI();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const cols = 4, rows = 4;
    const pad = 16 * dpr;
    const W = canvas.width - pad*2;
    const H = canvas.height - pad*2;
    const cellW = Math.floor(W / cols);
    const cellH = Math.floor(H / rows);

    // Background
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // Grid + room content
    ctx.translate(pad, pad);
    ctx.font = `${12*dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = mini.rooms[y][x];
        const gx = x * cellW;
        const gy = y * cellH;

        // Cell background (cleared rooms dimmed)
        const cleared = r.state?.cleared === true;
        ctx.fillStyle = cleared ? '#1a222c' : '#1e2a3a';
        ctx.fillRect(gx, gy, cellW-1, cellH-1);

        // Border
        ctx.strokeStyle = '#2a3545';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(gx + 0.5, gy + 0.5, cellW-1, cellH-1);

        // Labels
        const mobs = r.mobs.length ? r.mobs.map(m => m.id).join(',') : '-';
        const res  = r.resources.length ? r.resources.map(rr => rr.id).join(',') : '-';
        const text = `M:${mobs}\nR:${res}`;

        // Wrap two lines
        ctx.fillStyle = cleared ? '#9aa4ae' : '#cfe8ff';
        drawMultilineText(ctx, text, gx + cellW/2, gy + cellH/2, Math.min(cellW-10*dpr, 220*dpr));
      }
    }
  }

  function drawMultilineText(ctx, text, x, y, maxWidth) {
    const lines = text.split('\n');
    const lineH = parseInt(ctx.font, 10) + 2;
    const totalH = lineH * lines.length;
    let ty = y - totalH/2 + lineH/2;
    for (const line of lines) {
      ctx.fillText(line, x, ty, maxWidth);
      ty += lineH;
    }
  }

  // Click to toggle cleared
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;

    const cols = 4, rows = 4;
    const pad = 16 * dpr;
    const W = canvas.width - pad*2;
    const H = canvas.height - pad*2;
    const cellW = Math.floor(W / cols);
    const cellH = Math.floor(H / rows);

    const cx = Math.floor((x - pad) / cellW);
    const cy = Math.floor((y - pad) / cellH);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;

    const room = mini.rooms[cy][cx];
const key = { shardId, tileX, tileY, roomX: cx, roomY: cy };
const state = getRoomState(key) || { cleared: false, harvested: [] };

if (state.cleared) {
  // Already cleared → just toggle back for demo purposes
  state.cleared = false;
  setRoomState(key, state);
  room.state = state;
  draw();
  return;
}

// If mobs present, run mock combat overlay; on victory, mark cleared.
if (room.mobs && room.mobs.length > 0) {
  openCombatOverlay({
    parent: document.body,
    mobs: room.mobs,
    onClose: () => {
      // After overlay closes, if we disabled the fight (i.e., it ran),
      // consider the room cleared on victory by peeking at remaining mobs:
      // For mock simplicity, assume one fight clears the room.
      state.cleared = true;
      setRoomState(key, state);
      room.state = state;
      draw();
    }
  });
  return;
}

// No mobs? Just toggle cleared on click (e.g., after harvest).
state.cleared = !state.cleared;
setRoomState(key, state);
room.state = state;
draw();
});

  // Close
  wrap.querySelector('.btnClose').addEventListener('click', () => {
    parent.removeChild(wrap);
  });

  window.addEventListener('resize', draw);
  draw();

  return {
    destroy() {
      window.removeEventListener('resize', draw);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
  };
}
