// static/js/paperdoll.js
import { API } from './api.js';

const SLOT_NAMES = ['head','cloak','chest','belt','pants','boots','mainhand','offhand','jewelry','gadget'];

const UI_TO_SERVER_SLOT = {
  head: 'head',
  cloak: 'back',
  chest: 'chest',
  belt: 'belt',
  pants: 'legs',
  boots: 'feet',
  mainhand: 'main_hand',
  offhand: 'off_hand',
  jewelry: 'neck',   // change to 'ring1' if that’s your model
  gadget: 'hands',   // change if you have a gadget slot
};
const SERVER_TO_UI_SLOT = Object.fromEntries(Object.entries(UI_TO_SERVER_SLOT).map(([k, v]) => [v, k]));

const FALLBACK_ICON = '/static/assets/items/_fallback.png';
const CLEAR_PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const slotEls = {};
let equipment = {};

function el(sel, root = document) { return root.querySelector(sel); }

function iconFromItem(it) {
  const slug = it?.slug || it?.name || it?.display_name;
  const guess = slug ? `/static/assets/items/${String(slug).toLowerCase().replace(/\s+/g,'_').replace(/-/g,'_')}.png` : CLEAR_PX;
  return it?.icon_url || it?.icon_path || guess || CLEAR_PX;
}

// DRAGGABLE equipped icons + robust image fallback
function updateCell(cell, item) {
  if (!cell) return;
  if (!cell.firstChild) {
    const img = document.createElement('img');
    cell.appendChild(img);
  }
  const img = cell.firstChild;

  if (!item) {
    img.src = CLEAR_PX;
    img.alt = '';
    img.draggable = false;
    img.ondragstart = null;
    img.onerror = null;
    cell.classList.remove('filled');
    cell.removeAttribute('data-item-id');
    return;
  }

  img.alt = item.name || '';
  img.draggable = true;
  img.ondragstart = (e) => {
    const payload = { from: 'paperdoll', slot: item.slot, name: item.name };
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  };
  img.onerror = () => { img.onerror = null; img.src = CLEAR_PX; };
  img.src = item.icon || FALLBACK_ICON;

  cell.classList.add('filled');
  cell.setAttribute('data-item-id', item.id || '');
}

function pulse(elm, cls) {
  elm.classList.add(cls);
  setTimeout(() => elm.classList.remove(cls), 350);
}

function wireSlot(slot) {
  const cell = el(`.equip-slot[data-slot="${slot}"]`);
  if (!cell) return;
  slotEls[slot] = cell;

  // Right-click to unequip
  cell.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!equipment[slot]) return;
    document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot } }));
  });

  // Accept drops from inventory
  cell.addEventListener('dragover', (e) => e.preventDefault());
  cell.addEventListener('drop', async (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const data = JSON.parse(text);

    const serverSlot = UI_TO_SERVER_SLOT[slot] || slot;
    const body = { slot: serverSlot };
    if (data.character_item_id != null) body.character_item_id = data.character_item_id;
    else if (data.slug) body.slug = data.slug;
    if (!body.character_item_id && !body.slug) { pulse(cell, 'reject'); return; }

    cell.classList.add('busy');
    try {
      const characterId = await API.characterIdOrThrow();
      const dto = await API.equip(characterId, body);
      document.dispatchEvent(new CustomEvent('loadout:updated', { detail: dto }));
    } catch (err) {
      console.warn('[paperdoll] equip failed', err);
      pulse(cell, 'reject');
    } finally {
      cell.classList.remove('busy');
    }
  });
}

function applyLoadout(dto) {
  const eq = dto?.equipped || {};
  equipment = {};
  for (const s of SLOT_NAMES) updateCell(slotEls[s], null);

  for (const serverSlot of Object.keys(eq)) {
    const uiSlot = SERVER_TO_UI_SLOT[serverSlot] || serverSlot;
    const cell = slotEls[uiSlot];
    if (!cell) continue;
    const it = eq[serverSlot];
    if (!it) { equipment[uiSlot] = null; updateCell(cell, null); continue; }
    const itemObj = {
      id: it.slug || it.name || it.display_name || '',
      name: it.name || it.display_name || it.slug || 'Item',
      slot: uiSlot,
      icon: iconFromItem(it),
      qty: it.quantity ?? 1,
      rarity: it.rarity || null,
      slug: it.slug,
    };
    equipment[uiSlot] = itemObj;
    updateCell(cell, itemObj);
  }
}

async function loadFromAPI() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;
    const dto = await API.loadout(characterId);
    applyLoadout(dto);
  } catch (err) {
    console.error('[paperdoll] load failed', err);
  }
}

(function boot() {
  SLOT_NAMES.forEach(wireSlot);

  document.addEventListener('inventory:unequip', async (e) => {
    const { slot } = e.detail || {};
    if (!slot) return;
    const serverSlot = UI_TO_SERVER_SLOT[slot] || slot;
    const el = slotEls[slot];
    el?.classList.add('busy');
    try {
      const characterId = await API.characterIdOrThrow();
      const dto = await API.unequip(characterId, { slot: serverSlot });
      document.dispatchEvent(new CustomEvent('loadout:updated', { detail: dto }));
    } catch (err) {
      console.warn('[paperdoll] unequip failed', err);
      pulse(el, 'reject');
    } finally {
      el?.classList.remove('busy');
    }
  });

  loadFromAPI();
  document.addEventListener('loadout:updated', (e) => applyLoadout(e.detail || {}));
})();
