// static/src/dev/editor/shardGridRenderer.js
/*
  Responsibilities
  ----------------
  - Render tile grid efficiently (only the visible area)
  - Smooth pan/zoom with cursor-centric zoom (matches "main" feel)
  - Screen <-> world <-> tile conversions
  - Hover outline, selection outline, rectangle marquee (Shift+drag)
  - Resize-aware with devicePixelRatio handling
  - UI-agnostic: editing logic lives in shardEditorApp.js

  Quick tweak points
  ------------------
  - Zoom feel: wheel factor base inside _bindInteractions() (1.0015)
  - Gridlines threshold: scale >= 0.8 in redraw()
  - Fit padding: fitToShard(... { paddingTiles: 2 })
  - Colors: defaultColors() keys should match your biomeRegistry keys
*/

export class ShardGridRenderer {
  constructor(canvas, { cell = 12 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cell = cell;

    // View state
    this.scale = 1;
    this.origin = { x: 0, y: 0 };
    this.hover = null;
    this.selected = null;
    this.rectSel = null;
    this.autoFit = false;
    this.zoomAnchor = 'cursor'; // 'cursor' | 'center'

    this.colors = defaultColors();

    this._bindInteractions();
    this._resizeObs = new ResizeObserver(() => {
      this.resize();
      if (this.autoFit && this.shard) {
        this.fitToShard(this.shard.width, this.shard.height, { paddingTiles: 2 });
      }
    });
    this._resizeObs.observe(canvas.parentElement || canvas);
    this.resize();
  }

  dispose() {
    this._resizeObs?.disconnect();
    // If listeners ever get sticky, a hard replace drops them:
    // this.canvas.replaceWith(this.canvas.cloneNode(true));
  }

  setBiomeColors(map) { this.colors = { ...defaultColors(), ...map }; }

  // --- transforms ---
  worldToScreen(wx, wy) {
    return { x: (wx + this.origin.x) * this.scale, y: (wy + this.origin.y) * this.scale };
  }
  screenToWorld(px, py) {
    return { x: (px / this.scale) - this.origin.x, y: (py / this.scale) - this.origin.y };
  }
  screenToTile(px, py) {
    const w = this.screenToWorld(px, py);
    return { x: Math.floor(w.x / this.cell), y: Math.floor(w.y / this.cell) };
  }

  // --- sizing ---
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(2, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(2, Math.floor(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  // Keep the world point under the mouse cursor fixed while zooming.
  setScaleAt(factor, clientX, clientY) {
    const r  = this.canvas.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;

    // World-space position under the cursor BEFORE scaling
    const pre = this.screenToWorld(mx, my);

    // Apply new scale (clamped)
    this.scale = Math.max(0.1, Math.min(12, this.scale * factor));

    // Recompute origin so that 'pre' still maps to the same screen pixel (mx,my)
    this.origin.x = (mx / this.scale) - pre.x;
    this.origin.y = (my / this.scale) - pre.y;

    this.redraw();
  }

  centerOnTile(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (r.width / dpr) / 2;
    const cy = (r.height / dpr) / 2;
    const wx = x * this.cell + this.cell / 2;
    const wy = y * this.cell + this.cell / 2;
    this.origin.x = (cx / this.scale) - wx;
    this.origin.y = (cy / this.scale) - wy;
    this.redraw();
  }

  // Fit whole shard with padding; set autoFit so window resize preserves fit.
  fitToShard(width, height, { paddingTiles = 1, maxScale = 12 } = {}) {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const vw = r.width / dpr, vh = r.height / dpr;
    const neededW = (width + paddingTiles * 2) * this.cell;
    const neededH = (height + paddingTiles * 2) * this.cell;
    const s = Math.min(vw / neededW, vh / neededH);
    this.scale = Math.max(0.1, Math.min(maxScale, s));
    const totalW = width * this.cell, totalH = height * this.cell;
    const cx = vw / 2, cy = vh / 2, wx = totalW / 2, wy = totalH / 2;
    this.origin.x = (cx / this.scale) - wx;
    this.origin.y = (cy / this.scale) - wy;
    this.autoFit = true;
    this.redraw();
  }

  // --- data hooks ---
  setData(shard) { this.shard = shard; this.redraw(); }
  setHover(t) { this.hover = t; this.redraw(); }
  setSelected(t) { this.selected = t; this.redraw(); }
  setRectSel(r) { this.rectSel = r; this.redraw(); }

  // --- drawing ---
  paintTile(x, y, color) {
    const c = this.cell;
    const A = this.worldToScreen(x * c, y * c);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(A.x, A.y, c * this.scale, c * this.scale);
  }

  redraw() {
    const ctx = this.ctx, c = this.cell;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.shard) { ctx.restore(); return; }

    // Background
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Determine visible tile range
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = r.width / dpr, h = r.height / dpr;
    const minT = this.screenToTile(0, 0);
    const maxT = this.screenToTile(w, h);
    const width  = (this.shard.width  ?? (this.shard.tiles[0]?.length || 0));
    const height = (this.shard.height ?? this.shard.tiles.length);

    const x0 = Math.max(0, Math.min(minT.x, maxT.x));
    const y0 = Math.max(0, Math.min(minT.y, maxT.y));
    const x1 = Math.min(width  - 1, Math.max(minT.x, maxT.x));
    const y1 = Math.min(height - 1, Math.max(minT.y, maxT.y));

    // Tiles
    for (let y = y0; y <= y1; y++) {
      const row = this.shard.tiles[y]; if (!row) continue;
      for (let x = x0; x <= x1; x++) {
        const t = row[x]; if (!t) continue;
        const color = this.colors[t.biome] || '#3b4252'; // fallback
        this.paintTile(x, y, color);
      }
    }

    // Grid lines when zoomed in enough
    if (this.scale >= 0.8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = Math.max(1, this.scale * 0.5);
      for (let x = x0; x <= x1 + 1; x++) {
        const A = this.worldToScreen(x * c, y0 * c), B = this.worldToScreen(x * c, (y1 + 1) * c);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      for (let y = y0; y <= y1 + 1; y++) {
        const A = this.worldToScreen(x0 * c, y * c), B = this.worldToScreen((x1 + 1) * c, y * c);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    }

    // Selection
    if (this.selected) {
      const A = this.worldToScreen(this.selected.x * c, this.selected.y * c);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
      ctx.strokeRect(A.x, A.y, c * this.scale, c * this.scale);
    }

    // Rectangle marquee
    if (this.rectSel) {
      const r = this.rectSel;
      const Ax = Math.min(r.x0, r.x1), Ay = Math.min(r.y0, r.y1);
      const Bx = Math.max(r.x0, r.x1) + 1, By = Math.max(r.y0, r.y1) + 1;
      const A = this.worldToScreen(Ax * c, Ay * c);
      const W = (Bx - Ax) * c * this.scale, H = (By - Ay) * c * this.scale;
      ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.strokeRect(A.x, A.y, W, H);
      ctx.setLineDash([]);
    }

    // Hover
    if (this.hover) {
      const A = this.worldToScreen(this.hover.x * c, this.hover.y * c);
      ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.5;
      ctx.strokeRect(A.x, A.y, c * this.scale, c * this.scale);
    }

    ctx.restore();
  }

  // --- input ---
  _bindInteractions() {
    const cvs = this.canvas;

    let panning = false;
    let start = { x: 0, y: 0, ox: 0, oy: 0 };
    let rectStart = null;

    const isPan  = (e) => e.button === 1 || e.button === 2; // MMB or RMB
    const isLeft = (e) => e.button === 0;

    cvs.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom (cursor-anchored by default)
    cvs.addEventListener('wheel', (e) => {
      e.preventDefault();

      // Trackpads vs mouse wheels: use exponential to normalize the feel
      const factor = (e.deltaMode === 1)   // "lines"
        ? Math.pow(1.2,    -e.deltaY)
        : Math.pow(1.0015, -e.deltaY);     // "pixels"

      const rect = cvs.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const ax = (this.zoomAnchor === 'center') ? cx : e.clientX;
      const ay = (this.zoomAnchor === 'center') ? cy : e.clientY;

      this.setScaleAt(factor, ax, ay);
    }, { passive: false });

    cvs.addEventListener('pointerdown', (e) => {
      if (isPan(e)) {
        panning = true;
        start = { x: e.clientX, y: e.clientY, ox: this.origin.x, oy: this.origin.y };
        cvs.setPointerCapture?.(e.pointerId);
        return;
      }
      if (isLeft(e) && e.shiftKey) {
        const rect = cvs.getBoundingClientRect();
        const t = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
        rectStart = { ...t };
        this.setRectSel({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
        cvs.setPointerCapture?.(e.pointerId);
        return;
      }
    });

    cvs.addEventListener('pointermove', (e) => {
      const rect = cvs.getBoundingClientRect();
      const t = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);

      if (this.shard) {
        if (t.x >= 0 && t.y >= 0) this.setHover(t); else this.setHover(null);
      }

      if (panning) {
        const dx = (e.clientX - start.x) / this.scale;
        const dy = (e.clientY - start.y) / this.scale;
        this.origin.x = start.ox + dx;
        this.origin.y = start.oy + dy;
        this.redraw();
      } else if (rectStart) {
        this.setRectSel({ x0: rectStart.x, y0: rectStart.y, x1: t.x, y1: t.y });
      }
    });

    const end = (e) => {
      if (panning)   { panning = false; cvs.releasePointerCapture?.(e.pointerId); }
      if (rectStart) { rectStart = null; cvs.releasePointerCapture?.(e.pointerId); }
    };
    cvs.addEventListener('pointerup', end);
    cvs.addEventListener('pointercancel', end);
    cvs.addEventListener('pointerleave', end);

    window.addEventListener('keydown', (e) => {
      // Fit to shard view
      if (e.key.toLowerCase() === 'f') {
        if (this.shard) this.fitToShard(this.shard.width, this.shard.height, { paddingTiles: 2 });
      }
      // Zoom in/out (anchor near overlay)
      if (e.key === '+' || e.key === '=') {
        const rect = cvs.getBoundingClientRect();
        this.setScaleAt(1.1, rect.left + rect.width - 40, rect.top + 40);
      }
      if (e.key === '-') {
        const rect = cvs.getBoundingClientRect();
        this.setScaleAt(0.9, rect.left + rect.width - 40, rect.top + 40);
      }
      // Reset scale and center on shard center
      if (e.key === '0') {
        this.scale = 1;
        if (this.shard) this.centerOnTile(this.shard.width / 2, this.shard.height / 2);
      }
      // Toggle anchor (handy for comparing feels)
      if (e.key.toLowerCase() === 'z') {
        this.zoomAnchor = (this.zoomAnchor === 'cursor') ? 'center' : 'cursor';
      }
    });
  }
}

function defaultColors() {
  // Central place to tune editor colorways per biome.
  return {
    'land/grassland': '#4f8a3b',
    'land/forest'   : '#2f6b3a',
    'land/desert'   : '#c2a14a',
    'land/tundra'   : '#9fb5c5',
    'land/mountain' : '#777777',
    'land/swamp'    : '#3a5a4a',
    'land/badlands' : '#85635b',
    'water/ocean'   : '#224e7a',
    'water/lake'    : '#2e6aa3',
    'water/river'   : '#2c7cbf',
    'water/reef'    : '#3aa6b9',
  };
}
