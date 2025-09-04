/**
 * Camera: pan/zoom/bounds for tile world.
 * Zoom range 1.0..0.3 in 0.1 steps, 0.5s debounce label handled by main.
 */
export function createCamera({ canvas, onZoomChange }) {
  const cam = {
    zoom: 1.0,
    worldW: 0,
    worldH: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    dragStart: { x: 0, y: 0 },
  };

  /** Set world size in tiles. */
  cam.setWorldSize = (w, h) => { cam.worldW = w; cam.worldH = h; clampOffset(); };
  /** Center camera on a tile coordinate. */
  cam.centerOn = (tx, ty) => {
    const { width, height } = canvas;
    const px = tx * tileSize();
    const py = ty * tileSize();
    cam.offsetX = Math.floor(width / 2 - px);
    cam.offsetY = Math.floor(height / 2 - py);
    clampOffset();
  };
  /** Convert screen px to tile coords. */
  cam.screenToTile = (sx, sy) => {
    const t = tileSize();
    return { x: Math.floor((sx - cam.offsetX) / t), y: Math.floor((sy - cam.offsetY) / t) };
  };
  /** Convert tile coords to screen px center. */
  cam.tileToScreen = (tx, ty) => {
    const t = tileSize();
    return { x: Math.floor(tx * t + cam.offsetX), y: Math.floor(ty * t + cam.offsetY) };
  };
  /** Visible rect in tiles. */
  cam.visibleRect = () => {
    const t = tileSize();
    const x0 = Math.max(0, Math.floor(-cam.offsetX / t));
    const y0 = Math.max(0, Math.floor(-cam.offsetY / t));
    const x1 = Math.min(cam.worldW - 1, Math.ceil((canvas.width - cam.offsetX) / t));
    const y1 = Math.min(cam.worldH - 1, Math.ceil((canvas.height - cam.offsetY) / t));
    return { x0, y0, x1, y1 };
  };
  /** Pan in pixels. */
  cam.pan = (dx, dy) => { cam.offsetX += dx; cam.offsetY += dy; clampOffset(); };
  /** Zoom delta in steps of 0.1. */
  cam.zoomDelta = (dz) => {
    const newZ = Math.max(0.3, Math.min(1.0, Math.round((cam.zoom + dz) * 10) / 10));
    if (newZ !== cam.zoom) { cam.zoom = newZ; clampOffset(); onZoomChange?.(cam.zoom); }
  };

  function tileSize() { return Math.max(4, Math.floor(8 * cam.zoom * 2)); }
  function clampOffset() {
    // Keep within map bounds with slack
    const t = tileSize();
    const minX = -cam.worldW * t + 32;
    const minY = -cam.worldH * t + 32;
    const maxX = canvas.width - 32;
    const maxY = canvas.height - 32;
    cam.offsetX = Math.max(minX, Math.min(maxX, cam.offsetX));
    cam.offsetY = Math.max(minY, Math.min(maxY, cam.offsetY));
  }
  cam.tileSize = tileSize;
  return cam;
}

