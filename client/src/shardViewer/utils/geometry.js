// Geometry helpers used by placement and overlays

export function rectWithinBounds(x, y, w, h, maxW, maxH) {
  return x >= 0 && y >= 0 && (x + w) <= maxW && (y + h) <= maxH;
}

export function rectOverlapsAny(x, y, w, h, existingRects) {
  return existingRects?.some?.(r => !(x + w <= r.x || r.x + r.w <= x || y + h <= r.y || r.y + r.h <= y)) || false;
}

export function tilesInRect(x, y, w, h) {
  const result = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) result.push({ x: x + i, y: y + j });
  return result;
}

