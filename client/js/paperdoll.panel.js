// static/js/paperdoll.panel.js
(function () {
  const ROOT_ID = "cardCharacter";
  const MIME = "application/x-shard-item";
  const LS_KEY = "ui.char.equipment";
  // FIX: default to /client/assets; keep /static as a fallback
  const DEFAULT_ICON_BASE = "/client/assets/items/";
  const ALT_ICON_BASE = "/static/assets/items/";

  const ICONS = {
    iron_sword:    "iron_sword.png",
    wooden_sword:  "wooden_sword.png",
    buckler:       "buckler.png",
    leather_jerkin:"leather_jerkin.png",
    ripped_pants:  "ripped_pants.png",
    torch:         "torch.png",
    bread:         "bread.png",
    bandage:       "bandage.png",
    health_potion: "health_potion.png",
    whetstone:     "whetstone.png",
    oak_wood:      "oak_wood.png",
    _fallback:     "_fallback.png",
  };

  const KINDS = {
    iron_sword:    "weapon",
    wooden_sword:  "weapon",
    buckler:       "shield",
    leather_jerkin:"armor",
    ripped_pants:  "pants",
    torch:         "tool",
    bread:         "consumable",
    bandage:       "consumable",
    health_potion: "consumable",
    whetstone:     "tool",
    oak_wood:      "material"
  };

  const SLOT_ACCEPTS = {
    head:     ["head","generic"],
    cloak:    ["cloak","back","generic"],
    chest:    ["armor","chest","generic"],
    belt:     ["belt","generic"],
    pants:    ["pants","legs","generic"],
    boots:    ["boots","feet","generic"],
    mainhand: ["weapon","mainhand","generic"],
    offhand:  ["shield","offhand","weapon","generic"],
    jewelry:  ["ring","amulet","jewelry","generic"],
    gadget:   ["gadget","trinket","tool","generic"],
  };

  let ICON_BASE = DEFAULT_ICON_BASE;
  let root, slots = new Map();
  let equipment = {};
  let pendingDrag = null;
  let remote = { load:null, save:null };

  injectStyles(`
    .equip-slot.hot { outline: 1px solid #62c0ff; box-shadow: 0 0 0 2px rgba(98,192,255,.35) inset; }
    .equip-slot.reject { animation: rej .35s; }
    @keyframes rej { 0%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} 100%{transform:translateX(0)} }
  `);

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.querySelectorAll(".equip-slot").forEach(el => {
      const id = el.dataset.slot;
      if (id) { slots.set(id, el); wireSlotDnD(el, id); }
    });

    loadEquipment().then(() => { renderAll(); exposePublicAPI(); });
  }

  function wireSlotDnD(el, slotId) {
    el.addEventListener("dragenter", (e) => {
      const item = peekDragItem(e);
      if (item && canEquip(slotId, item)) { el.classList.add("hot"); e.preventDefault(); }
    });
    el.addEventListener("dragover", (e) => {
      const item = peekDragItem(e);
      if (item && canEquip(slotId, item)) { el.classList.add("hot"); e.preventDefault(); }
    });
    el.addEventListener("dragleave", () => el.classList.remove("hot"));

    el.addEventListener("drop", (e) => {
      e.preventDefault(); el.classList.remove("hot");
      const item = readDragItem(e);
      if (!item) return;
      if (!canEquip(slotId, item)) return reject(el);
      equip(slotId, normalizeItem(item));
    });

    el.addEventListener("dragstart", (e) => {
      const item = equipment[slotId];
      if (!item) return e.preventDefault();
      setDragData(e.dataTransfer, item);
      e.dataTransfer.effectAllowed = "move";
      pendingDrag = { slotId, item };
    });
    el.addEventListener("dragend", (e) => {
      if (pendingDrag && e.dataTransfer && e.dataTransfer.dropEffect !== "none") {
        unequip(pendingDrag.slotId);
      }
      pendingDrag = null;
    });

    el.addEventListener("click", () => { if (equipment[slotId]) unequip(slotId); });
    el.tabIndex = 0;
    el.addEventListener("keydown", (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && equipment[slotId]) {
        e.preventDefault(); unequip(slotId);
      }
    });
  }

  function equip(slotId, item) {
    const prev = equipment[slotId] || null;
    equipment[slotId] = item;
    renderSlot(slotId);
    persist();
    if (prev) dispatch("paperdoll:unequipped", { slot: slotId, item: prev });
    dispatch("paperdoll:equipped", { slot: slotId, item });
    maybeSaveRemote();
  }
  function unequip(slotId) {
    const prev = equipment[slotId]; if (!prev) return;
    equipment[slotId] = null;
    renderSlot(slotId);
    persist();
    dispatch("paperdoll:unequipped", { slot: slotId, item: prev });
    maybeSaveRemote();
  }

  function renderAll(){ for (const id of slots.keys()) renderSlot(id); }
  function renderSlot(slotId) {
    const el = slots.get(slotId); if (!el) return;
    el.innerHTML = "";
    const item = equipment[slotId];
    if (!item) { el.title = el.getAttribute("aria-label") + " (drop item)"; return; }
    const img = document.createElement("img");
    img.alt = item.name || item.id; img.draggable = true;
    img.src = resolveIcon(item);
    el.appendChild(img);
    el.title = `${item.name || niceId(item.id)} — click to unequip`;
  }

  function canEquip(slotId, item) {
    const kind = item.kind || getItemKind(item.id);
    const allow = SLOT_ACCEPTS[slotId] || ["generic"];
    return allow.includes(kind) || allow.includes("generic");
  }
  function normalizeItem(item) {
    return {
      id: String(item.id || "").trim(),
      name: item.name || niceId(item.id || ""),
      kind: item.kind || getItemKind(item.id || ""),
      icon: item.icon || null,
      stack: Number(item.stack || 1)
    };
  }
  function niceId(id){
    return String(id||"")
      .replace(/\.(png|jpg|jpeg|webp)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, s => s.toUpperCase()) || "Item";
  }
  function getItemKind(id){ return KINDS[id] || "generic"; }
  function resolveIcon(item){
    if (item.icon) return item.icon;
    const file = ICONS[item.id] || ICONS._fallback;
    return ICON_BASE + file;
  }

  function persist(){ try { localStorage.setItem(LS_KEY, JSON.stringify(equipment)); } catch{} }
  async function loadEquipment(){
    if (typeof remote.load === "function") {
      try { const s = await remote.load(); if (s && typeof s === "object") { equipment = s; seedMissing(); return; } }
      catch (e) { console.warn("[paperdoll] remote load failed; using local.", e); }
    }
    try { equipment = JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; }
    catch { equipment = {}; }
    seedMissing();
  }
  function seedMissing(){ for (const id of ["head","cloak","chest","belt","pants","boots","mainhand","offhand","jewelry","gadget"]) if (!(id in equipment)) equipment[id] = null; }
  async function maybeSaveRemote(){ if (typeof remote.save === "function") { try { await remote.save(equipment); } catch {} } }

  function setDragData(dt, item){
    const j = JSON.stringify(item);
    dt.setData(MIME, j);
    dt.setData("text/plain", j);
  }
  function readDragItem(e){
    try {
      const dt = e.dataTransfer; if (!dt) return null;
      if (Array.from(dt.types||[]).includes(MIME)) return JSON.parse(dt.getData(MIME));
      const t = dt.getData("text/plain"); if (t) { try { return JSON.parse(t); } catch{} }
      return null;
    } catch { return null; }
  }
  function peekDragItem(e){ return readDragItem(e); }

  function dispatch(name, detail){ document.dispatchEvent(new CustomEvent(name, { detail })); }
  function reject(el){ el.classList.remove("hot"); el.classList.add("reject"); setTimeout(()=>el.classList.remove("reject"), 360); }
  function injectStyles(css){ const tag=document.createElement("style"); tag.textContent=css; document.head.appendChild(tag); }

  function exposePublicAPI(){
    window.paperdollPanel = {
      getEquipment(){ return JSON.parse(JSON.stringify(equipment)); },
      setEquipment(map){ if (map && typeof map === "object"){ equipment = {}; seedMissing(); for (const k in map) equipment[k] = map[k]; persist(); renderAll(); } },
      setIconBase(path){ if (typeof path === "string") ICON_BASE = path.endsWith("/")? path : path+"/"; renderAll(); },
      setRemoteAdapters({ load, save } = {}){ remote.load = typeof load==="function"? load : null; remote.save = typeof save==="function"? save : null; }
    };

    // Try default path once; fall back to /static if it fails
    const img = new Image();
    img.onerror = () => { ICON_BASE = ALT_ICON_BASE; renderAll(); };
    img.src = ICON_BASE + (ICONS._fallback || "_fallback.png");
  }
})();
