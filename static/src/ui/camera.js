// Minimal camera that centers the shard and handles zoom transforms.
import { ZOOM_LEVELS, DEFAULT_ZOOM_INDEX, CAMERA_DEBOUNCE_MS, VIEW } from '../config/mapConfig.js';

export class Camera {
  constructor(viewCanvas, shardPixelW, shardPixelH) {
    this.canvas = viewCanvas;
    this.ctx = viewCanvas.getContext('2d');
    this.zoomIndex = DEFAULT_ZOOM_INDEX;
    this.scale = ZOOM_LEVELS[this.zoomIndex];
    this.translateX = 0;
    this.translateY = 0;
    this.shardW = shardPixelW;
    this.shardH = shardPixelH;
    this._lastZoomAt = 0;
    this._recalc();
  }

  get scaleValue() {
    return this.scale;
  }

  setShardSize(pxW, pxH) {
    this.shardW = pxW;
    this.shardH = pxH;
    this._recalc();
  }

  setZoomIndex(i) {
    this.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
    this.scale = ZOOM_LEVELS[this.zoomIndex];
    this._recalc();
  }

  zoomIn() { this._debouncedZoom(-1); }
  zoomOut() { this._debouncedZoom(+1); }

  _debouncedZoom(delta) {
    const now = performance.now();
    if (now - this._lastZoomAt < CAMERA_DEBOUNCE_MS) return;
    this._lastZoomAt = now;
    this.setZoomIndex(this.zoomIndex + delta);
  }

  _recalc() {
    const dpr = window.devicePixelRatio || 1;
    const viewW = this.canvas.clientWidth * dpr;
    const viewH = this.canvas.clientHeight * dpr;

    const scaledW = this.shardW * this.scale;
    const scaledH = this.shardH * this.scale;

    // Center the shard with a small margin
    this.translateX = Math.round((viewW - scaledW) / 2);
    this.translateY = Math.round((viewH - scaledH) / 2);

    // Keep a margin to “float” it
    this.translateX = Math.max(this.translateX, VIEW.marginPx * dpr);
    this.translateY = Math.max(this.translateY, VIEW.marginPx * dpr);
  }

  apply(ctx) {
    ctx.setTransform(this.scale, 0, 0, this.scale, this.translateX, this.translateY);
  }

  // Convert screen (mouse) to world and then to tile coordinates
  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    const worldX = (x - this.translateX) / this.scale;
    const worldY = (y - this.translateY) / this.scale;
    return { worldX, worldY };
  }
}
