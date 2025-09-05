/**
 * Overlays: grid, region borders, selection box and UI layer drawings.
 */
import { drawIcon } from './icons.js';
import { getDraft } from './state/draftBuffer.js';

export function createOverlay({ overlayCanvas, uiCanvas, getState }) {
  const octx = overlayCanvas.getContext('2d');
  const uctx = uiCanvas.getContext('2d');

  function draw() {
    const { cam, shard, show, tools } = getState();
    if (!shard) { clearAll(); return; }
    // overlay
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (show.grid) drawGrid(octx, cam);
    if (show.regions) drawRegions(octx, cam, shard);
    if (show.poi) drawPOIIcons(octx, cam, shard);
    // Draft settlements (dev preview)
    drawDraftSettlements(octx, cam);
    // ui
    uctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    drawSelection(uctx, cam, tools.selection);
    drawPointerHighlight(uctx, cam, tools.pointerOnce, tools.pointerHover);
  }

  function clearAll(){ octx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height); uctx.clearRect(0,0,uiCanvas.width,uiCanvas.height); }

  function drawGrid(ctx, cam) {
    const t = cam.tileSize();
    const vr = cam.visibleRect();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let y = vr.y0; y <= vr.y1; y++) {
      const sy = y * t + cam.offsetY + 0.5;
      ctx.beginPath(); ctx.moveTo(vr.x0 * t + cam.offsetX, sy); ctx.lineTo((vr.x1+1) * t + cam.offsetX, sy); ctx.stroke();
    }
    for (let x = vr.x0; x <= vr.x1; x++) {
      const sx = x * t + cam.offsetX + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, vr.y0 * t + cam.offsetY); ctx.lineTo(sx, (vr.y1+1) * t + cam.offsetY); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRegions(ctx, cam, shard) {
    const t = cam.tileSize();
    ctx.save();
    ctx.strokeStyle = 'rgba(0,102,255,0.35)';
    ctx.lineWidth = 2;
    // simple chunk borders every 16 tiles
    const size = 16;
    for (let y = 0; y <= shard.size.height; y += size) {
      const sy = y * t + cam.offsetY + 0.5;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(overlayCanvas.width, sy); ctx.stroke();
    }
    for (let x = 0; x <= shard.size.width; x += size) {
      const sx = x * t + cam.offsetX + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, overlayCanvas.height); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSelection(ctx, cam, rect) {
    if (!rect) return;
    const t = cam.tileSize();
    const x = rect.x0 * t + cam.offsetX;
    const y = rect.y0 * t + cam.offsetY;
    const w = (rect.x1 - rect.x0 + 1) * t;
    const h = (rect.y1 - rect.y0 + 1) * t;
    ctx.save();
    ctx.fillStyle = 'rgba(0,128,255,0.15)';
    ctx.strokeStyle = 'rgba(0,128,255,0.8)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    ctx.restore();
  }

  function drawPointerHighlight(ctx, cam, pointerOnce, hover) {
    if (!pointerOnce || !hover) return;
    const t = cam.tileSize();
    const x = hover.x * t + cam.offsetX;
    const y = hover.y * t + cam.offsetY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
    ctx.fillStyle = 'rgba(255, 255, 0, 0.18)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, t, t);
    ctx.strokeRect(x+0.5, y+0.5, t-1, t-1);
    ctx.restore();
  }

  function drawPOIIcons(ctx, cam, shard) {
    const t = cam.tileSize();
    const size = Math.max(10, Math.floor(t * 0.75));
    for (const poi of shard.pois || []) {
      const sx = poi.x * t + cam.offsetX + Math.floor(t/2);
      const sy = poi.y * t + cam.offsetY + Math.floor(t/2);
      drawIcon(ctx, poi.type || 'note', sx, sy, size);
      // Optional label when tiles are large
      if (t >= 14) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.font = `${Math.max(10, Math.floor(t*0.45))}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const label = (poi.name || poi.type || '').toString();
        const txt = label.length > 16 ? `${label.slice(0,16)}…` : label;
        // text shadow for readability
        ctx.strokeText(txt, sx, sy + size * 0.6);
        ctx.fillText(txt, sx, sy + size * 0.6);
        ctx.restore();
      }
    }
  }

  function drawDraftSettlements(ctx, cam){
    const draft = getDraft();
    const list = Object.values(draft?.settlements || {});
    if (!list.length) return;
    const t = cam.tileSize();
    ctx.save();
    for (const s of list){
      const { x, y, w, h } = s.bounds || {};
      if (typeof x !== 'number') continue;
      const sx = x * t + cam.offsetX, sy = y * t + cam.offsetY; const sw = w * t, sh = h * t;
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#fbbf24'; ctx.fillRect(sx, sy, sw, sh);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.strokeRect(sx+0.5, sy+0.5, sw-1, sh-1);
      if (t >= 14) {
        ctx.font = `${Math.max(10, Math.floor(t*0.45))}px system-ui`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const label = `${s.tier || ''} ${s.name || ''}`.trim();
        ctx.fillStyle = '#111'; ctx.fillText(label, sx + 4, sy + 4);
      }
    }
    ctx.restore();
  }

  return { draw };
}
