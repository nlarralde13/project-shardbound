// static/js/shardLoader.js
// Minimal shard renderer for the layout sandbox (fills #frame completely).
(function () {
  const FRAME_ID = "frame";
  const DEFAULT_SHARD = "00089451_default.json";

  // Try a few likely locations; first one that exists is used.
  const CANDIDATE_PATHS = [
    "/static/public/shards/00089451_default.json",
    "00089451_default.json",
  ];

  // Biome colors
  const BIOME = {
    ocean:        "#1e4a92",
    coast:        "#c7b06a",
    plains:       "#78c25d",
    forest:       "#2e7b3b",
    hills:        "#8a6d55",
    mountains:    "#7d7d7d",
    "marsh-lite": "#5c7e66",
    lake:         "#3aa7e5",
    city:         "#c4b7a6",
    town:         "#bda273",
    village:      "#a88c5e",
    port:         "#b08968",
  };
  const FALLBACK = "#666";

  class ShardViewer {
    constructor(frameEl) {
      this.frame = frameEl;
      this.canvas = document.createElement("canvas");
      this.canvas.id = "mapCanvas";
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.ctx.imageSmoothingEnabled = false;

      this.frame.innerHTML = "";
      this.frame.appendChild(this.canvas);

      this.ro = new ResizeObserver(() => this.resizeAndRender());
      this.ro.observe(this.frame);

      this.shard = null;
      window.shardViewer = this; // for console debugging
    }

    async load(paths = CANDIDATE_PATHS) {
      let data = null;
      for (const url of paths) {
        try {
          const r = await fetch(url, { credentials: "same-origin" });
          if (r.ok) { data = await r.json(); break; }
        } catch {}
      }
      if (!data) data = this._fallback();
      this.setShard(data);
    }

    setShard(raw) {
      const w = Number(raw?.size?.width ?? raw?.meta?.width ?? raw?.width ?? 16);
      const h = Number(raw?.size?.height ?? raw?.meta?.height ?? raw?.height ?? 16);
      let rows = raw?.tiles;

      if (!Array.isArray(rows) || !Array.isArray(rows[0])) {
        // synthesize plains if shape is unexpected
        rows = Array.from({ length: h }, () =>
          Array.from({ length: w }, () => ({ biome: "plains" }))
        );
      }
      this.shard = { w, h, rows, pois: Array.isArray(raw?.pois) ? raw.pois : [] };
      this.resizeAndRender();
    }

    resizeAndRender() {
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const rect = this.frame.getBoundingClientRect();

      this.canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      this.canvas.style.width  = `${Math.max(1, Math.floor(rect.width))}px`;
      this.canvas.style.height = `${Math.max(1, Math.floor(rect.height))}px`;

      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
      ctx.imageSmoothingEnabled = false;

      this.render();
    }

    // === FILL THE FRAME COMPLETELY (no letterbox) ===
    render() {
      const ctx = this.ctx;
      const cw = this.canvas.clientWidth;
      const ch = this.canvas.clientHeight;

      // background
      ctx.fillStyle = "#0f0d16";
      ctx.fillRect(0, 0, cw, ch);

      if (!this.shard) return;
      const { w:mw, h:mh, rows, pois } = this.shard;

      // Scale map-space (mw × mh) to screen-space (cw × ch)
      const scaleX = cw / mw;
      const scaleY = ch / mh;

      // Draw tiles in map space (1×1 rects), scaled to fill frame
      ctx.save();
      ctx.scale(scaleX, scaleY);
      for (let y = 0; y < mh; y++) {
        const row = rows[y] || [];
        for (let x = 0; x < mw; x++) {
          const cell = row[x] || {};
          ctx.fillStyle = BIOME[cell.biome] || FALLBACK;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.restore();

      // Subtle grid in screen space (stays crisp)
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "rgba(0,0,0,.8)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= mw; gx++) {
        const X = Math.round(gx * scaleX) + 0.5;
        ctx.beginPath(); ctx.moveTo(X, 0); ctx.lineTo(X, ch); ctx.stroke();
      }
      for (let gy = 0; gy <= mh; gy++) {
        const Y = Math.round(gy * scaleY) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(cw, Y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // POIs (use screen-space scale for radius)
      if (Array.isArray(pois)) {
        const rBase = Math.max(2, Math.min(scaleX, scaleY) * 0.18);
        const rRing = Math.max(3, Math.min(scaleX, scaleY) * 0.28);
        for (const p of pois) {
          const cx = (p.x + 0.5) * scaleX;
          const cy = (p.y + 0.5) * scaleY;
          ctx.fillStyle = "#d4a64e";
          ctx.beginPath(); ctx.arc(cx, cy, rBase, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,.7)";
          ctx.beginPath(); ctx.arc(cx, cy, rRing, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    _fallback() {
      const w = 16, h = 16;
      const tiles = [];
      for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) {
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          row.push({ biome: edge ? "ocean" : "plains" });
        }
        tiles.push(row);
      }
      return { size:{ width:w, height:h }, tiles, pois: [] };
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) { console.warn("#frame not found – shardLoader idle."); return; }
    const viewer = new ShardViewer(frame);
    await viewer.load();
  });
})();
