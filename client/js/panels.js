// static/js/panels.js
// Free layout controller: draggable panels, snap-to-grid INSIDE #playfield.
// Modes: pixel snap (x,y) or column snap (x only) + pixel snap (y). With magnetic edges + guides.

const MODE_KEY = "ui.freeLayout";
const LOCK_KEY = "ui.freeLayout.locked";
const SNAP_KEY = "ui.freeLayout.snapPx";
const COLW_KEY = "ui.freeLayout.colW";
const MODE_SNAP = "ui.freeLayout.snapMode"; // "pixel" | "cols"
const POS_KEY  = "ui.panelPos."; // + id

const CONTAINER_ID = "playfield";
const PANEL_SEL    = ".panel";

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k,d=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } };

let container, snapPx=24, colW=360, snapMode="pixel", locked=false, free=false;
let zTop = 1000;
let vGuide, hGuide;

function uiSync(){
  const sm = $("#snapMode"), sp = $("#snapPxSelect"), cw = $("#colSelect");
  const fs = $("#fieldSnapPx"), fc = $("#fieldColW");
  if (sm) sm.value = snapMode;
  if (sp) sp.value = String(snapPx);
  if (cw) cw.value = String(colW);
  if (fs) fs.style.display = snapMode === "pixel" ? "" : "none";
  if (fc) fc.style.display = snapMode === "cols"  ? "" : "none";
  document.documentElement.style.setProperty("--snap", `${snapPx}px`);
}

function setSnapPx(px){ snapPx = Math.max(4, Number(px)||24); save(SNAP_KEY,snapPx); uiSync(); }
function setColW(px){ colW = Math.max(80, Number(px)||360);   save(COLW_KEY,colW); uiSync(); }
function setSnapMode(mode){ snapMode = (mode==="cols"?"cols":"pixel"); save(MODE_SNAP,snapMode); uiSync(); }

function getContainerRect(){ const r = container.getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; }
function bringFront(el){ el.style.zIndex = (++zTop).toString(); }

function colStep(){
  const gap = parseFloat(getComputedStyle(container).gap || "12") || 12;
  return colW + gap; // virtual column step (column + gap)
}

/* alignment guides */
function ensureGuides(){
  if (!vGuide){ vGuide = document.createElement("div"); vGuide.className = "guide v"; container.appendChild(vGuide); vGuide.style.display = "none"; }
  if (!hGuide){ hGuide = document.createElement("div"); hGuide.className = "guide h"; container.appendChild(hGuide); hGuide.style.display = "none"; }
}
function showVGuide(x){ ensureGuides(); vGuide.style.left = `${x}px`; vGuide.style.display = "block"; }
function showHGuide(y){ ensureGuides(); hGuide.style.top  = `${y}px`; hGuide.style.display = "block"; }
function hideGuides(){ if (vGuide) vGuide.style.display = "none"; if (hGuide) hGuide.style.display = "none"; }

/* snap+clamp helpers */
function snapX(x){
  if (snapMode === "cols"){
    const step = colStep();
    return Math.round(x / step) * step;
  }
  return Math.round(x / snapPx) * snapPx;
}
function snapY(y){ return Math.round(y / snapPx) * snapPx; }

function clamp(x, y, el){
  const { width:W, height:H } = getContainerRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  x = Math.min(Math.max(x, 0), Math.max(0, W - w));
  y = Math.min(Math.max(y, 0), Math.max(0, H - h));
  return {x,y};
}

function magnet(x, y, el){
  // Magnetic edges toward container edges and other panels.
  const thr = 8;
  const c = getContainerRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let bestX = x, bestY = y, foundV=false, foundH=false;

  const others = $$(PANEL_SEL, container).filter(p => p !== el);
  const xTargets = [0, c.width, ...others.flatMap(p => {
    const r = p.getBoundingClientRect();
    return [r.left - c.left, r.right - c.left];
  })];

  const yTargets = [0, c.height, ...others.flatMap(p => {
    const r = p.getBoundingClientRect();
    return [r.top - c.top, r.bottom - c.top];
  })];

  // left/right edges
  for (const t of xTargets){
    if (Math.abs(x - t) <= thr){ bestX = t; foundV = true; break; }              // left->left or left->right
    if (Math.abs(x + w - t) <= thr){ bestX = t - w; foundV = true; break; }      // right->left/right
  }
  // top/bottom edges
  for (const t of yTargets){
    if (Math.abs(y - t) <= thr){ bestY = t; foundH = true; break; }              // top align
    if (Math.abs(y + h - t) <= thr){ bestY = t - h; foundH = true; break; }      // bottom align
  }

  // guides
  hideGuides();
  if (foundV) showVGuide(bestX);
  if (foundH) showHGuide(bestY);
  return {x:bestX, y:bestY};
}

function place(el, x, y){
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;
  el.style.position = "absolute";
}

function restoreOrSeed(el, id){
  const saved = load(POS_KEY + id);
  if (saved){ place(el, saved.x, saved.y); }
  else {
    const c = getContainerRect(), r = el.getBoundingClientRect();
    place(el, r.left - c.left, r.top - c.top);
    save(POS_KEY + id, { x: r.left - c.left, y: r.top - c.top });
  }
}

function makeDraggable(el, id){
  const handle = el.querySelector(".card-h") || el;

  const onDown = (e) => {
    if (locked || e.button !== 0) return;
    bringFront(el);
    el.classList.add("dragging");

    const start = { x: e.clientX, y: e.clientY };
    const base  = { x: parseFloat(el.style.left||"0"), y: parseFloat(el.style.top||"0") };

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;

      let nx = snapX(base.x + dx);
      let ny = snapY(base.y + dy);

      ({x:nx, y:ny} = magnet(nx, ny, el));          // magnetic adjust
      ({x:nx, y:ny} = clamp(nx, ny, el));           // clamp to container

      place(el, nx, ny);
    };

    const onUp = () => {
      el.classList.remove("dragging");
      hideGuides();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const c = getContainerRect(), r = el.getBoundingClientRect();
      save(POS_KEY + id, { x: r.left - c.left, y: r.top - c.top });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  handle.addEventListener("pointerdown", onDown);
}

function enableFreeLayout(on){
  free = !!on;
  if (free){
    container.classList.remove("docked");
    container.classList.add("free");
    $$(PANEL_SEL, container).forEach((el) => {
      if (!el.id) el.id = crypto.randomUUID();
      restoreOrSeed(el, el.id);
      makeDraggable(el, el.id);
    });
    document.body.dataset.freeLayout = "1";
  } else {
    container.classList.remove("free");
    container.classList.add("docked");
    document.body.dataset.freeLayout = "";
    $$(PANEL_SEL, container).forEach((el) => {
      el.style.left = el.style.top = el.style.position = el.style.zIndex = "";
      el.classList.remove("dragging");
    });
    hideGuides();
  }
  save(MODE_KEY, free ? 1 : 0);
  uiSync();
}

function setLocked(isLocked){
  locked = !!isLocked;
  save(LOCK_KEY, locked ? 1 : 0);
  const b = $("#toggleLock"); if (b) b.textContent = locked ? "Unlock panels" : "Lock panels";
}

function resetPositions(){
  $$(PANEL_SEL, container).forEach(el => localStorage.removeItem(POS_KEY + el.id));
  if (free){ enableFreeLayout(false); enableFreeLayout(true); }
}

function remapIntoBounds(){
  if (!free) return;
  $$(PANEL_SEL, container).forEach((el) => {
    let x = parseFloat(el.style.left||"0"), y = parseFloat(el.style.top||"0");
    ({x,y} = clamp(x,y,el));
    place(el,x,y);
    save(POS_KEY + el.id, {x,y});
  });
}

function init(){
  container = $("#"+CONTAINER_ID);
  ensureGuides();

  // load prefs
  setSnapPx(load(SNAP_KEY, 24));
  setColW(load(COLW_KEY, 360));
  setSnapMode(load(MODE_SNAP, "pixel"));
  setLocked(load(LOCK_KEY, 0) === 1);
  enableFreeLayout(load(MODE_KEY, 0) === 1);

  // controls
  $("#toggleLayout")?.addEventListener("click", () => enableFreeLayout(!free));
  $("#toggleLock")?.addEventListener("click", () => setLocked(!locked));
  $("#resetLayout")?.addEventListener("click", resetPositions);
  $("#snapMode")?.addEventListener("change", (e) => setSnapMode(e.target.value));
  $("#snapPxSelect")?.addEventListener("change", (e) => setSnapPx(e.target.value));
  $("#colSelect")?.addEventListener("change", (e) => setColW(e.target.value));

  // stay in bounds on resize
  window.addEventListener("resize", remapIntoBounds);
  uiSync();
}
window.addEventListener("DOMContentLoaded", init);
