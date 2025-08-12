// /static/src/data/inputCommands.js
// Centralized inputs for camera + console helpers.
export function initInputCommands({ getCtx }) {
  // getCtx() should return { pixi, canvas } from main when called

  // --- Keyboard: pan with WASD / Arrows ---
  

  // --- Touch: pinch to zoom + two-finger pan ---
  let touchState = null;

  function getTouches(e) {
    const rect = (getCtx()?.canvas)?.getBoundingClientRect();
    return Array.from(e.touches).map(t => ({
      x: t.clientX - rect.left,
      y: t.clientY - rect.top
    }));
  }

  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
  function mid(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length < 2) return;
    const pts = getTouches(e);
    touchState = {
      lastMid: mid(pts[0], pts[1]),
      lastDist: dist(pts[0], pts[1])
    };
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!touchState || e.touches.length < 2) return;
    e.preventDefault();

    const ctx = getCtx(); if (!ctx?.pixi) return;
    const w = ctx.pixi.world || ctx.pixi.stage;

    const pts = getTouches(e);
    const m  = mid(pts[0], pts[1]);
    const d  = dist(pts[0], pts[1]);

    // zoom delta
    const scaleNow = w.scale.x || 1;
    const target   = clamp(scaleNow * (d / touchState.lastDist), 0.5, 3);
    setZoomAround(ctx, target, m.x, m.y);

    // pan by mid movement
    const dx = m.x - touchState.lastMid.x;
    const dy = m.y - touchState.lastMid.y;
    w.position.x += dx;
    w.position.y += dy;

    touchState.lastMid = m;
    touchState.lastDist = d;

    clampToBounds(ctx);
  }, { passive: false });

  window.addEventListener('touchend', () => { touchState = null; }, { passive: true });

  // Helpers
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  function setZoomAround({ pixi }, newScale, anchorX, anchorY){
    const w = pixi.world || pixi.stage;
    const old = w.scale.x || 1;
    const s = clamp(newScale, 0.5, 3);
    if (s === old) return;

    const mx = anchorX, my = anchorY;
    const wx = (mx - w.position.x) / old;
    const wy = (my - w.position.y) / old;
    w.scale.set(s);
    w.position.set(mx - wx * s, my - wy * s);

    const label = document.getElementById('zoomDisplay');
    if (label) label.textContent = `${Math.round(s*100)}%`;
  }

  function clampToBounds({ pixi, canvas }){
    // Simple soft clamp that keeps some margin; refine after tileset swap.
    const w = pixi.world || pixi.stage;
    const s = w.scale.x || 1;
    const margin = 100;

    // Allow wide roam for now; just prevent total runaway
    w.position.x = clamp(w.position.x, -canvas.width*2, canvas.width*2);
    w.position.y = clamp(w.position.y, -canvas.height*2, canvas.height*2);
  }

  // expose a programmatic center used by console command 'center'
  return {
    centerOnScreen(){
      const { pixi, canvas } = getCtx(); if (!pixi) return;
      const w = pixi.world || pixi.stage;
      // reset transform
      w.scale.set(1);
      w.position.set(0,0);
      const label = document.getElementById('zoomDisplay');
      if (label) label.textContent = '100%';
    }
  };
}
