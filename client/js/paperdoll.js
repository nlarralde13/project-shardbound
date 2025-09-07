// /static/js/paperdoll.js
// Builds the equip ring around the central doll and manages drag/drop.
// Public: dispatches 'equip:changed'; listens for 'inventory:unequip'.

import { API } from './api.js';

const SLOT_NAMES = ['head','cloak','chest','belt','pants','boots','mainhand','offhand','jewelry','gadget'];
const slotEls = {};
let equipment = {}; // { slot: {id,name,slot,icon,qty} }

function $(sel, root=document) { return root.querySelector(sel); }
function $all(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

function updateCell(cell, item) {
  cell.dataset.rarity = item?.rarity ? String(item.rarity).toLowerCase() : "";

  if (!cell) return;
  if (item) {
    cell.style.backgroundImage = `url(${item.icon})`;
    cell.title = item.name;
    cell.setAttribute('draggable', 'true');
  } else {
    cell.style.backgroundImage = ""; // fallback shows placeholder from CSS
    cell.removeAttribute('title');
    cell.setAttribute('draggable', 'true'); // still draggable (for consistent UX)
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

    // Only allow items meant for this slot; inventory entries should include .slot
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
    // pull active character id then call your equipment endpoint
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;

    const r = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' });
    if (!r.ok) return;

    const data = await r.json();
    equipment = {};
    for (const slot of SLOT_NAMES) {
      const it = data[slot];
      if (it) {
        equipment[slot] = {
          id: it.slug || it.item_id,
          name: it.name || it.slug,
          slot,
          icon: it.icon_path || it.icon_url || '/static/public/placeholders/item_64.png',
          qty: it.quantity || 1,
        };
        updateCell(slotEls[slot], equipment[slot]);
      } else {
        updateCell(slotEls[slot], null);
      }
    }
  } catch (err) {
    console.error('[paperdoll] load failed', err);
  }
}

(function boot() {
  // make sure slots that exist in HTML are wired
  SLOT_NAMES.forEach(wireSlot);
  listenForUnequip();
  loadFromAPI(); // populates current equipment
})();
