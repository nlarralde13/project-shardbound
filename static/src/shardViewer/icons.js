/**
 * Minimal icon atlas for POIs. Generates vector glyphs on canvases and caches by (type,size).
 * - shardgate: purple diamond portal glyph
 * - fallback: gray circle
 */

const CACHE = new Map(); // key: `${type}:${size}` => canvas

export function getIconCanvas(type, size = 16) {
  const key = `${type}:${Math.round(size)}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(8, Math.round(size));
  const ctx = c.getContext('2d');
  drawGlyph(ctx, type, c.width, c.height);
  CACHE.set(key, c);
  return c;
}

export function getIconDataURL(type, size = 16) {
  return getIconCanvas(type, size).toDataURL();
}

export function drawIcon(ctx, type, x, y, size) {
  const img = getIconCanvas(type, size);
  const hw = img.width >> 1; const hh = img.height >> 1;
  ctx.drawImage(img, Math.round(x - hw), Math.round(y - hh));
}

function drawGlyph(ctx, type, w, h) {
  ctx.clearRect(0,0,w,h);
  const cx = w/2, cy = h/2; const r = Math.min(w,h) * 0.38;
  ctx.save();
  ctx.lineWidth = Math.max(1, Math.round(Math.min(w,h) * 0.08));
  ctx.strokeStyle = '#000';
  switch (type) {
    case 'shardgate': {
      // Purple diamond with inner portal ring
      const R = r * 1.05;
      ctx.fillStyle = '#7b5cff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx + R, cy);
      ctx.lineTo(cx, cy + R);
      ctx.lineTo(cx - R, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // inner ring (portal)
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      break;
    }
    case 'site': case 'town': case 'dungeon': case 'resource': case 'spawn': case 'note': default: {
      // Minimal universal fallback: colored circle
      ctx.fillStyle = poiColor(type);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function poiColor(type) {
  switch (type) {
    case 'shardgate': return '#7b5cff';
    case 'site': return '#ffb300';
    case 'dungeon': return '#ff5252';
    case 'town': return '#4caf50';
    case 'resource': return '#00bcd4';
    case 'spawn': return '#9c27b0';
    case 'note': return '#607d8b';
    default: return '#333';
  }
}

