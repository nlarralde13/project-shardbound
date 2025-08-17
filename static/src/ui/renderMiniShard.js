// Simple 4×4 mini-shard overlay renderer for MVP1.
// Renders rooms, shows basic labels, lets you mark a room "cleared" (demo).
import { setRoomState, getRoomState } from "../state/roomState.js";
import { openCombatOverlay } from "./combatOverlay.js";

export function openMiniShardOverlay(input) {
  // Tolerate different caller shapes: either a slice directly, or an options object.
  const slice  = input?.rooms ? input : (input?.slice ?? input?.mini ?? null);
  const parentNode = input?.parent ?? document.body;
  const shardId = input?.shardId ?? slice?.shardId ?? "A";
  const tileX   = input?.tileX   ?? slice?.tileX   ?? 0;
  const tileY   = input?.tileY   ?? slice?.tileY   ?? 0;
  const biome   = input?.biome   ?? slice?.biome   ?? "unknown";

  if (!slice || !slice.rooms || !slice.rooms.length || !slice.rooms[0]?.length) {
    console.error("[mini] openMiniShardOverlay expected a slice with rooms[][]");
    return;
  }

  // ---- Build overlay shell ----
  const wrap = document.createElement("div");
  wrap.className = "miniOverlay";
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
  parentNode.appendChild(wrap);

  const canvas = wrap.querySelector(".miniCanvas");
  const ctx = canvas.getContext("2d");

  function fitHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 512;
    const cssH = canvas.clientHeight || 512;
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }

  // Drawing utils
  function drawMultilineText(ctx, text, x, y, maxWidth) {
    const lines = text.split("\n");
    const fontPx = parseInt(ctx.font, 10) || 12;
    const lineH = fontPx + 2;
    const totalH = lineH * lines.length;
    let ty = y - totalH / 2 + lineH / 2;
    for (const line of lines) {
      ctx.fillText(line, x, ty, maxWidth);
      ty += lineH;
    }
  }

  function draw() {
    fitHiDPI();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rows = slice.height || slice.rooms.length;
    const cols = slice.width  || slice.rooms[0].length;

    const pad  = 16 * dpr;
    const W = canvas.width  - pad * 2;
    const H = canvas.height - pad * 2;
    const cellW = Math.floor(W / cols);
    const cellH = Math.floor(H / rows);

    // Background
    ctx.fillStyle = "#0b0e13";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid + room content
    ctx.translate(pad, pad);
    ctx.font = `${12 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = slice.rooms[y][x];
        const gx = x * cellW;
        const gy = y * cellH;

        // Determine cleared/revealed from our simple room structure
        const cleared = r.state?.cleared === true || r.resolved === true;
        const revealed = r.revealed !== false; // show all for MVP; change to (r.revealed===true) when fog gating

        // Cell background
        ctx.fillStyle = cleared ? "#1a222c" : (revealed ? "#1e2a3a" : "#131922");
        ctx.fillRect(gx, gy, cellW - 1, cellH - 1);

        // Border
        ctx.strokeStyle = "#2a3545";
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(gx + 0.5, gy + 0.5, cellW - 1, cellH - 1);

        // Labels (robust to varying room shapes)
        const mobs = Array.isArray(r.mobs) ? r.mobs.length : 0;
        const hasNode = !!r.node;
        const isChest = r.kind === "chest";
        const isHaz   = !!r.hazard;

        let text = "";
        text += `M:${mobs > 0 ? mobs : "-"}`;
        text += `\nR:${hasNode ? "node" : "-"}`;
        if (isChest) text += `\nChest`;
        if (isHaz)   text += `\nHaz`;

        ctx.fillStyle = cleared ? "#9aa4ae" : "#cfe8ff";
        drawMultilineText(ctx, text, gx + cellW / 2, gy + cellH / 2, Math.min(cellW - 10 * dpr, 220 * dpr));
      }
    }
  }

  // Click → toggle cleared, or run mock combat if mobs exist
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top)  * dpr;

    const rows = slice.height || slice.rooms.length;
    const cols = slice.width  || slice.rooms[0].length;

    const pad  = 16 * dpr;
    const W = canvas.width  - pad * 2;
    const H = canvas.height - pad * 2;
    const cellW = Math.floor(W / cols);
    const cellH = Math.floor(H / rows);

    const cx = Math.floor((px - pad) / cellW);
    const cy = Math.floor((py - pad) / cellH);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;

    const room = slice.rooms[cy][cx];
    const key = { shardId, tileX, tileY, roomX: cx, roomY: cy };
    const state = getRoomState(key) || { cleared: false, harvested: [] };

    // If there are mobs, open combat, then mark cleared on close (mock)
    if (Array.isArray(room.mobs) && room.mobs.length > 0) {
      openCombatOverlay({
        parent: document.body,
        mobs: room.mobs,
        onClose: () => {
          state.cleared = true;
          setRoomState(key, state);
          room.state = state;
          draw();
        }
      });
      return;
    }

    // Otherwise just toggle cleared for demo purposes
    state.cleared = !state.cleared;
    setRoomState(key, state);
    room.state = state;
    draw();
  });

  // Close button
  wrap.querySelector(".btnClose").addEventListener("click", () => {
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  });

  // Resize redraw
  const onResize = () => draw();
  window.addEventListener("resize", onResize);

  // Initial render
  draw();

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
  };
}
