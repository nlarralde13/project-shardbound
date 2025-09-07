// /static/js/paperdoll.js
// Equip ring around the central doll + drag/drop equip/unequip.
// Mirrors inventory's slug→icon behavior and uses <img> for icons.

import { API } from './api.js';

const SLOT_NAMES = ['head','cloak','chest','belt','pants','boots','mainhand','offhand','jewelry','gadget'];
const FALLBACK_ICON = '/static/assets/items/_fallback.png'; // create or override below
const CLEAR_PX = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 1x1 transparent

const slotEls = {};
let equipment = {}; // { slot: {id,name,slot,icon,qty,rarity} }

function $(sel, root=document)  { return root.querySelector(sel); }

function normalizeSlug(s) {
  return String(s || '')
    .trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]/g, '_');
}
function iconFromItem(obj) {
  const slug = obj?.slug || obj?.name || obj?.display_name || '';
  const inferred = slug ? `/static/assets/items/${normalizeSlug(slug)}.png` : FALLBACK_ICON;
  return obj?.icon_url || obj?.icon_path || inferred || FALLBACK_ICON;
}

function setCellIcon(cell, url, name, rarity) {
  if (!cell) return;

  let img = cell.querySelector('img.icon');
  if (!img) {
    img = document.createElement('img');
    img.className = 'icon';
    img.draggable = false;
    cell.appendChild(img);
  }

  img.onload = () => cell.classList.remove('img-broken');
  img.onerror = () => {
    console.warn('[paperdoll] icon 404:', url);
    img.src = FALLBACK_ICON || CLEAR_PX;
    cell.classList.add('img-broken');
  };

  img.src = url || CLEAR_PX;
  img.alt = name || '';
  cell.title = name || '';

  cell.dataset.rarity = rarity ? String(rarity).toLowerCase() : '';
}

function updateCell(cell, item) {
  if (!cell) return;
  if (item) {
    setCellIcon(cell, item.icon, item.name, item.rarity);
    cell.setAttribute('draggable', 'true');
  } else {
    setCellIcon(cell, '', '', null); // returns to placeholder frame
    cell.setAttribute('draggable', 'true');
  }
}

function wireSlot(slot) {
  const cell = document.querySelector(`.equip-slot[data-slot="${slot}"]`);
  if (!cell) return;
  slotEls[slot] = cell;

  cell.addEventListener('dragstart', e => {
    const item = equipment[slot];
    if (!item) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', JSON.stringify({ ...item, from: 'paperdoll', slot }));
  });

  cell.addEventListener('dragover', e => e.preventDefault());

  cell.addEventListener('drop', e => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const data = JSON.parse(text);

    // Only allow correct-slot items when a slot is specified
    if (data.slot && data.slot !== slot) {
      cell.classList.add('reject'); setTimeout(()=>cell.classList.remove('reject'), 300);
      return;
    }

    const previous = equipment[slot] || null;
    equipment[slot] = { ...data, slot };
    updateCell(cell, equipment[slot]);

    document.dispatchEvent(new CustomEvent('equip:changed', {
      detail: { slot, item: { ...data, slot }, previous }
    }));
  });
}

function listenForUnequip() {
  document.addEventListener('inventory:unequip', e => {
    const { slot } = e.detail || {};
    if (!slot) return;
    equipment[slot] = null;
    updateCell(slotEls[slot], null);
  });
}

async function loadFromAPI() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;

    const r = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!r.ok) return;

    const data = await r.json(); // expects keys per slot
    equipment = {};
    for (const slot of SLOT_NAMES) {
      const it = data[slot];
      const cell = slotEls[slot];
      if (!cell) continue;

      if (it) {
        const icon = iconFromItem(it);
        const slug = it.slug || it.name || it.display_name || it.item_id || slot;
        const itemObj = {
          id: slug,
          name: it.name || it.display_name || slug,
          slot,
          icon,
          qty: it.quantity || 1,
          rarity: it.rarity || null,
        };
        equipment[slot] = itemObj;
        updateCell(cell, itemObj);
      } else {
        equipment[slot] = null;
        updateCell(cell, null);
      }
    }
  } catch (err) {
    console.error('[paperdoll] load failed', err);
  }
}

(function boot() {
  SLOT_NAMES.forEach(wireSlot);
  listenForUnequip();
  loadFromAPI(); // populate current equipment
})();
