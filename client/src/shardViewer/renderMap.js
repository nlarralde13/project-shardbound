/**
 * Renderer: draws base tiles and POIs. Only visible tiles are drawn.
 */
import { biomeColor } from './schema.js';

export function createRenderer({ baseCanvas, getState, onHover }) {
  const ctx = baseCanvas.getContext('2d');

  /** Redraw visible region. */
  function draw() {
    const { cam, shard, show } = getState();
    if (!shard) return;
    const t = cam.tileSize();
    ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    const vr = cam.visibleRect();
    for (let y = vr.y0; y <= vr.y1; y++) {
      const row = shard.tiles[y];
      if (!row) continue;
      for (let x = vr.x0; x <= vr.x1; x++) {
        const tile = row[x];
        const col = biomeColor(tile?.biome || 'unknown');
        const sx = x * t + cam.offsetX;
        const sy = y * t + cam.offsetY;
        ctx.fillStyle = col;
        ctx.fillRect(sx, sy, t, t);
      }
    }
    drawOptionalLayers(ctx, getState());
  }

  // POI markers are rendered in overlay layer now

  function drawOptionalLayers(ctx, { cam, shard }) {
    // Rivers (if available as polylines in shard.meta.layers.rivers or shard.layers.rivers)
    const rivers = shard?.meta?.layers?.rivers || shard?.layers?.rivers;
    if (Array.isArray(rivers)) {
      const t = cam.tileSize();
      ctx.save();
      ctx.strokeStyle = 'rgba(80,160,255,0.8)';
      ctx.lineWidth = Math.max(1, t * 0.15);
      for (const river of rivers) {
        if (!Array.isArray(river) || river.length < 2) continue;
        ctx.beginPath();
        for (let i=0;i<river.length;i++){
          const pt = river[i];
          const sx = pt.x * t + cam.offsetX + t/2;
          const sy = pt.y * t + cam.offsetY + t/2;
          if (i===0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Hover handling
  baseCanvas.addEventListener('mousemove', (e) => {
    const { cam, shard } = getState();
    if (!shard) return onHover?.(null);
    const rect = baseCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const { x: tx, y: ty } = cam.screenToTile(x, y);
    const t = shard.tiles[ty]?.[tx];
    if (!t) return onHover?.(null);
    onHover?.({ x: tx, y: ty, biome: t.biome, elevation: t.elevation, flags: t.flags, screenX: e.clientX, screenY: e.clientY });
  });
  baseCanvas.addEventListener('mouseleave', () => onHover?.(null));

  return { draw };
}
