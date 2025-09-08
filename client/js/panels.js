// static/js/panels.js
const MODE_KEY = "ui.freeLayout";
const POS_KEY  = "ui.panelPos.";
const LOCK_KEY = "ui.panelLock";
const PANELS   = ["cardCharacter","mapCard","cardActions","cardQuests","cardJournal","cardConsole"];

const GRID = 20; // snap panels to 20px grid

const $ = (id) => document.getElementById(id);
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

let zTop = 1000;
const bringFront = (el) => el.style.zIndex = (++zTop).toString();

function clampToViewport(x, y, el){
  const w = el.offsetWidth, h = el.offsetHeight;
  const minX = 0, minY = 48; // keep below topbar
  const maxX = Math.max(0, window.innerWidth  - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
}

function snap(n){ return Math.round(n / GRID) * GRID; }

function place(el, x, y){
  el.style.left = snap(x) + "px";
  el.style.top  = snap(y) + "px";
  el.style.position = "fixed";
}

function panelsLocked(){ return document.body.dataset.panelsLocked === "1"; }

function setLocked(on){
  document.body.dataset.panelsLocked = on ? "1" : "";
  save(LOCK_KEY, on ? 1 : 0);
  const lockBtn = $("toggleLock");
  if (lockBtn) lockBtn.textContent = on ? "Unlock panels" : "Lock panels";
}

function makeDraggable(panel, id){
  const handle = panel.querySelector(".card-h") || panel;

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || panelsLocked()) return; // left click only and not locked
    panel.setPointerCapture?.(e.pointerId);
    bringFront(panel);
    panel.classList.add("dragging");

    const start = { x: e.clientX, y: e.clientY };
    const rect  = panel.getBoundingClientRect();
    const base  = { x: rect.left, y: rect.top };

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const next = clampToViewport(base.x + dx, base.y + dy, panel);
      place(panel, next.x, next.y);
    };

    const onUp = () => {
      panel.classList.remove("dragging");
      panel.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const r = panel.getBoundingClientRect();
      save(POS_KEY + id, { x: r.left, y: r.top });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  // Double-click header to reset this panel’s saved position
  handle.addEventListener("dblclick", () => {
    if (panelsLocked()) return;
    localStorage.removeItem(POS_KEY + id);
    const r = panel.getBoundingClientRect();
    place(panel, 20, Math.max(60, r.top)); // simple reset
    save(POS_KEY + id, { x: 20, y: Math.max(60, r.top) });
  });
}

function enableFreeLayout(on){
  document.body.dataset.freeLayout = on ? "1" : "";
  save(MODE_KEY, on ? 1 : 0);

  if (on){
    // first-time positioning based on current layout (or saved)
    PANELS.forEach((id) => {
      const el = $(id); if (!el) return;
      const saved = load(POS_KEY + id);
      if (saved) {
        place(el, saved.x, saved.y);
      } else {
        const r = el.getBoundingClientRect();
        place(el, r.left, r.top);
        save(POS_KEY + id, { x: r.left, y: r.top });
      }
      makeDraggable(el, id);
    });
  } else {
    // return to docked grid
    PANELS.forEach((id) => {
      const el = $(id); if (!el) return;
      el.style.left = el.style.top = el.style.position = el.style.zIndex = "";
      el.classList.remove("dragging");
    });
    setLocked(false);
  }
}

function init(){
  const btn = $("toggleLayout");
  if (btn){
    btn.addEventListener("click", () => {
      const on = document.body.dataset.freeLayout === "1";
      enableFreeLayout(!on);
      btn.textContent = !on ? "Dock panels" : "Free layout";
    });
  }

  const lockBtn = $("toggleLock");
  if (lockBtn){
    lockBtn.addEventListener("click", () => {
      const on = panelsLocked();
      setLocked(!on);
    });
  }

  const shouldEnable = load(MODE_KEY) === 1;
  enableFreeLayout(shouldEnable);
  setLocked(load(LOCK_KEY) === 1);
  if (btn) btn.textContent = shouldEnable ? "Dock panels" : "Free layout";
}

window.addEventListener("DOMContentLoaded", init);
