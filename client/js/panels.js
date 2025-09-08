// static/js/panels.js
// Bounded, draggable, snapping panels for #playfield.
// New: modifier keys (Shift/Alt/Ctrl), transform-while-drag, collapse/minimize.
// Keeps: pixel/column snap, magnetic edges + guides, persistence, panelsAPI.

//////////////////////////////////////
// Keys / config
//////////////////////////////////////
const MODE_KEY   = "ui.freeLayout";
const LOCK_KEY   = "ui.freeLayout.locked";
const SNAP_KEY   = "ui.freeLayout.snapPx";
const COLW_KEY   = "ui.freeLayout.colW";
const MODE_SNAP  = "ui.freeLayout.snapMode"; // "pixel" | "cols"
const POS_KEY    = "ui.panelPos.";           // + id
const COLLAPSE_K = "ui.panelCollapsed.";     // + id

const CONTAINER_ID = "playfield";
const PANEL_SEL    = ".panel";

//////////////////////////////////////
// Utilities
//////////////////////////////////////
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k,d=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } };

let container, snapPx=24, colW=360, snapMode="pixel", locked=false, free=false;
let zTop = 1000;
let vGuide, hGuide;

//////////////////////////////////////
// Snap helpers
//////////////////////////////////////
function uiSync() {
  document.documentElement.style.setProperty("--snap", `${snapPx}px`);
}

function setSnapPx(px){ snapPx = Math.max(4, Number(px)||24); save(SNAP_KEY,snapPx); uiSync(); if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced(); }
function setColW(px){ colW = Math.max(80, Number(px)||360);   save(COLW_KEY,colW);   if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced(); }
function setSnapMode(mode){ snapMode = (mode==="cols"?"cols":"pixel"); save(MODE_SNAP,snapMode); if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced(); }

function getContainerRect(){ const r = container.getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; }
function bringFront(el){ el.style.zIndex = (++zTop).toString(); }

function colStep(){
  // virtual column step for "cols" snap: col width + CSS grid gap
  const gap = parseFloat(getComputedStyle(container).gap || "12") || 12;
  return colW + gap;
}

function snapX(x, stepOverride=null){
  if (snapMode === "cols"){
    const step = colStep();
    return Math.round(x / step) * step;
  }
  const step = stepOverride ?? snapPx;
  return Math.round(x / step) * step;
}
function snapY(y, stepOverride=null){
  const step = stepOverride ?? snapPx;
  return Math.round(y / step) * step;
}

function clamp(x, y, el){
  const { width:W, height:H } = getContainerRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  x = Math.min(Math.max(x, 0), Math.max(0, W - w));
  y = Math.min(Math.max(y, 0), Math.max(0, H - h));
  return {x,y};
}

//////////////////////////////////////
// Magnetic edges + guides
//////////////////////////////////////
function ensureGuides(){
  if (!vGuide){ vGuide = document.createElement("div"); vGuide.className = "guide v"; container.appendChild(vGuide); vGuide.style.display = "none"; }
  if (!hGuide){ hGuide = document.createElement("div"); hGuide.className = "guide h"; container.appendChild(hGuide); hGuide.style.display = "none"; }
}
function showVGuide(x){ ensureGuides(); vGuide.style.left = `${x}px`; vGuide.style.display = "block"; }
function showHGuide(y){ ensureGuides(); hGuide.style.top  = `${y}px`; hGuide.style.display = "block"; }
function hideGuides(){ if (vGuide) vGuide.style.display = "none"; if (hGuide) hGuide.style.display = "none"; }

function magnet(x, y, el){
  // Magnetic edges toward container and other panels; shows guides when snapping.
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
    if (Math.abs(x - t) <= thr){ bestX = t; foundV = true; break; }
    if (Math.abs(x + w - t) <= thr){ bestX = t - w; foundV = true; break; }
  }
  // top/bottom edges
  for (const t of yTargets){
    if (Math.abs(y - t) <= thr){ bestY = t; foundH = true; break; }
    if (Math.abs(y + h - t) <= thr){ bestY = t - h; foundH = true; break; }
  }

  hideGuides();
  if (foundV) showVGuide(bestX);
  if (foundH) showHGuide(bestY);
  return {x:bestX, y:bestY};
}

//////////////////////////////////////
// Placement + persistence
//////////////////////////////////////
function place(el, x, y){
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;
  el.style.position = "absolute";
}

function restoreOrSeed(el, id){
  const saved = load(POS_KEY + id);
  if (saved){ place(el, saved.x, saved.y); }
  else {
    // seed from docked position
    const c = getContainerRect(), r = el.getBoundingClientRect();
    place(el, r.left - c.left, r.top - c.top);
    save(POS_KEY + id, { x: r.left - c.left, y: r.top - c.top });
  }
}

//////////////////////////////////////
// Collapse / minimize
//////////////////////////////////////
function applyCollapsedState(el, collapsed){
  const header = el.querySelector(".card-h");
  if (!header) return;

  const kids = Array.from(el.children).filter(n => n !== header);
  if (collapsed){
    // hide everything except header, set fixed height to header
    kids.forEach(n => n.style.display = "none");
    const h = header.getBoundingClientRect().height || 40;
    el.style.height = `${Math.ceil(h)+2}px`;
    el.dataset.collapsed = "1";
  } else {
    kids.forEach(n => n.style.display = "");
    el.style.height = "";
    delete el.dataset.collapsed;
  }
  save(COLLAPSE_K + el.id, !!collapsed ? 1 : 0);
}

function toggleCollapse(el){
  const isCollapsed = el.dataset.collapsed === "1";
  applyCollapsedState(el, !isCollapsed);
}

function ensureHeaderControls(el){
  const header = el.querySelector(".card-h");
  if (!header) return;

  // Chevron button (if not present)
  if (!header.querySelector(".panel-toggle")){
    const btn = document.createElement("button");
    btn.className = "panel-toggle";
    btn.type = "button";
    btn.title = "Collapse / expand";
    btn.setAttribute("aria-pressed", "false");
    btn.style.cssText = "margin-left:auto; background:none; border:0; color:#e9e4d8; cursor:pointer; opacity:.8; display:inline-flex; align-items:center; gap:6px;";
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>`;
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCollapse(el);
      btn.setAttribute("aria-pressed", el.dataset.collapsed === "1" ? "true" : "false");
    });
  }

  // Double-click header also toggles collapse
  if (!header.dataset._dbl){
    header.dataset._dbl = "1";
    header.addEventListener("dblclick", (e) => {
      e.preventDefault();
      toggleCollapse(el);
    });
  }

  // Restore saved state
  const saved = load(COLLAPSE_K + el.id, 0) === 1;
  applyCollapsedState(el, saved);
}

//////////////////////////////////////
// Drag logic (transform while dragging)
//////////////////////////////////////
function makeDraggable(el, id){
  const handle = el.querySelector(".card-h") || el;
  handle.tabIndex = 0; // for keyboard nudging

  handle.addEventListener("pointerdown", (e) => {
    if (locked || e.button !== 0) return;

    bringFront(el);
    el.classList.add("dragging");

    // Base starting pos from current left/top
    const baseX = parseFloat(el.style.left||"0");
    const baseY = parseFloat(el.style.top ||"0");

    // Cache container rect for the drag session
    const c = getContainerRect();

    // Visual perf
    el.style.willChange = "transform";

    const onMove = (ev) => {
      // dx/dy from cursor
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;

      // Modifiers
      const fine   = ev.ctrlKey || ev.metaKey;   // smaller step
      const nosnap = ev.altKey;                  // temporarily disable snap
      const constrain = ev.shiftKey;             // constrain axis

      // Work coordinates before snapping
      let nx = baseX + dx;
      let ny = baseY + dy;

      if (constrain) {
        // constrain to dominant axis
        if (Math.abs(dx) > Math.abs(dy)) ny = baseY;
        else nx = baseX;
      }

      // Snap unless Alt/Option held
      if (!nosnap) {
        const step = fine ? Math.max(1, Math.round(snapPx/2)) : null;
        nx = snapX(nx, step);
        ny = snapY(ny, step);
      }

      // Magnetic edges + clamp
      ({x:nx, y:ny} = magnet(nx, ny, el));
      ({x:nx, y:ny} = clamp(nx, ny, el));

      // Render with transform (but do not mutate left/top during drag)
      const tx = nx - baseX;
      const ty = ny - baseY;
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };

    const onUp = () => {
      el.classList.remove("dragging");
      el.style.willChange = "";
      hideGuides();

      // Compute final absolute X/Y based on current transform
      const tf = getComputedStyle(el).transform;
      let nx = baseX, ny = baseY;
      if (tf && tf !== "none") {
        const m = tf.match(/matrix\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map(parseFloat);
          const tx = parts[4] || 0;
          const ty = parts[5] || 0;
          nx = baseX + tx;
          ny = baseY + ty;
        }
      }

      // Clear transform and commit left/top once
      el.style.transform = "";
      ({x:nx, y:ny} = clamp(nx, ny, el));
      place(el, nx, ny);

      // Persist relative to container
      const r = el.getBoundingClientRect();
      save(POS_KEY + id, { x: r.left - c.left, y: r.top - c.top });
      if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced();

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
  });

  // Keyboard nudging for accessibility
  handle.addEventListener("keydown", (e) => {
    if (!free) return;
    let stepX, stepY;
    const fine = (e.ctrlKey || e.metaKey);

    if (snapMode === "cols"){
      stepX = fine ? Math.max(1, Math.round(colStep()/2)) : colStep();
      stepY = fine ? 1 : snapPx;
    } else {
      stepX = fine ? 1 : snapPx;
      stepY = fine ? 1 : snapPx;
    }

    const c = getContainerRect();
    const r = el.getBoundingClientRect();
    let x = r.left - c.left, y = r.top - c.top;
    let used = false;

    if (e.key === "ArrowLeft")  { x -= stepX; used = true; }
    if (e.key === "ArrowRight") { x += stepX; used = true; }
    if (e.key === "ArrowUp")    { y -= stepY; used = true; }
    if (e.key === "ArrowDown")  { y += stepY; used = true; }

    if (used){
      e.preventDefault();
      ({x,y} = clamp(x,y,el));
      place(el, x, y);
      save(POS_KEY + el.id, {x,y});
      if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced();
    }

    // Space toggles collapse
    if (e.code === "Space") {
      e.preventDefault();
      toggleCollapse(el);
    }
  });
}

//////////////////////////////////////
// Mode + lock + reset
//////////////////////////////////////
function enableFreeLayout(on){
  free = !!on;
  if (free){
    container.classList.remove("docked");
    container.classList.add("free");
    $$(PANEL_SEL, container).forEach((el) => {
      if (!el.id) el.id = crypto.randomUUID();
      restoreOrSeed(el, el.id);
      ensureHeaderControls(el);
      makeDraggable(el, el.id);
    });
    document.body.dataset.freeLayout = "1";
  } else {
    container.classList.remove("free");
    container.classList.add("docked");
    document.body.dataset.freeLayout = "";
    $$(PANEL_SEL, container).forEach((el) => {
      el.style.left = el.style.top = el.style.position = el.style.zIndex = el.style.transform = el.style.willChange = "";
      el.classList.remove("dragging");
    });
    hideGuides();
  }
  save(MODE_KEY, free ? 1 : 0);
  if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced();
  uiSync();
}

function setLocked(isLocked){
  locked = !!isLocked;
  save(LOCK_KEY, locked ? 1 : 0);
  if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced();
}

function resetToDefaultLayout(){
  if (!container) return;
  const c = container.getBoundingClientRect();
  const gap = 24;

  const map  = document.getElementById("mapCard");
  const acts = document.getElementById("cardActions");
  const cons = document.getElementById("cardConsole");
  const char = document.getElementById("cardCharacter");
  const qlog = document.getElementById("cardQuests");
  const jour = document.getElementById("cardJournal");

  const mapW = map?.offsetWidth  || 720, mapH = map?.offsetHeight  || 460;
  const actW = acts?.offsetWidth || 200, actH = acts?.offsetHeight || 320;
  const conW = cons?.offsetWidth || 720, conH = cons?.offsetHeight || 180;

  const x0 = 0, y0 = 0;

  if (map)  place(map,  snapX(x0),                 snapY(y0));
  if (acts) place(acts, snapX(x0 + mapW + gap),    snapY(y0));
  if (cons) place(cons, snapX(x0),                 snapY(y0 + mapH + gap));
  if (char) place(char, snapX(x0),                 snapY(y0 + mapH + conH + gap*2));
  if (qlog) place(qlog, snapX(x0 + mapW + gap),    snapY(y0 + actH + gap));
  if (jour) place(jour, snapX(x0 + mapW + gap),    snapY(y0 + actH + (qlog?.offsetHeight || 160) + gap*2));

  [map, acts, cons, char, qlog, jour].forEach((el) => {
    if (!el) return;
    const r = el.getBoundingClientRect(), cc = container.getBoundingClientRect();
    save(POS_KEY + el.id, { x: r.left - cc.left, y: r.top - cc.top });
  });

  if (window.saveLayoutToServerDebounced) window.saveLayoutToServerDebounced();
}

//////////////////////////////////////
// Resize safety
//////////////////////////////////////
function remapIntoBounds(){
  if (!free) return;
  $$(PANEL_SEL, container).forEach((el) => {
    let x = parseFloat(el.style.left||"0"), y = parseFloat(el.style.top||"0");
    ({x,y} = clamp(x,y,el));
    place(el,x,y);
    save(POS_KEY + el.id, {x,y});
  });
}

//////////////////////////////////////
// Init
//////////////////////////////////////
function init(){
  container = $("#"+CONTAINER_ID);
  ensureGuides();

  // load prefs (local first; server sync can override later if you wired it)
  setSnapPx(load(SNAP_KEY, 24));
  setColW(load(COLW_KEY, 360));
  setSnapMode(load(MODE_SNAP, "pixel"));
  setLocked(load(LOCK_KEY, 0) === 1);
  enableFreeLayout(load(MODE_KEY, 0) === 1);

  // Keep panels in-bounds on resize
  window.addEventListener("resize", () => { remapIntoBounds(); });
}

//////////////////////////////////////
// Expose minimal control API
//////////////////////////////////////
window.panelsAPI = {
  // state
  isFree:   () => free === true,
  isLocked: () => locked === true,

  // actions
  enableFreeLayout,     // (on:boolean)
  setLocked,            // (on:boolean)
  resetToDefaultLayout, // () -> void

  // optional: snap controls if you later add UI hooks
  setSnapPx, setColW, setSnapMode
};

window.addEventListener("DOMContentLoaded", init);
