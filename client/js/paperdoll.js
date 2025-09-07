/* paperdoll.js
   Builds equipment slots and handles equip/unequip via drag & drop.
   Public events: dispatches 'equip:changed'; listens for 'inventory:unequip'.
*/

import { API } from './api.js';

const slots = ['head','cloak','chest','belt','pants','boots','mainhand','offhand','jewelry','gadget'];
let equipment = {};
const slotEls = {};

const doll = document.getElementById('paperdoll');

slots.forEach(slot => {
  const cell = document.createElement('div');
  cell.className = 'equip-slot';
  cell.dataset.slot = slot;
  cell.draggable = true;
  slotEls[slot] = cell;
  updateCell(cell, equipment[slot]);

  cell.addEventListener('dragstart', e => {
    const item = equipment[slot];
    if (!item) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', JSON.stringify({ ...item, from: 'paperdoll', slot }));
  });

  cell.addEventListener('dragover', e => e.preventDefault());
  cell.addEventListener('drop', e => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
    if (data.slot && data.slot === slot) {
      const previous = equipment[slot] || null;
      equipment[slot] = { ...data };
      updateCell(cell, data);
      document.dispatchEvent(new CustomEvent('equip:changed', { detail: { slot, item: data, previous } }));
    } else {
      cell.classList.add('reject');
      setTimeout(() => cell.classList.remove('reject'), 300);
    }
  });

  doll.appendChild(cell);
});

function updateCell(cell, item) {
  if (item) {
    cell.style.backgroundImage = `url(${item.icon})`;
    cell.title = item.name;
  } else {
    cell.style.backgroundImage = '';
    cell.removeAttribute('title');
  }
}

document.addEventListener('inventory:unequip', e => {
  const { slot } = e.detail;
  equipment[slot] = null;
  const cell = doll.querySelector(`.equip-slot[data-slot="${slot}"]`);
  if (cell) updateCell(cell, null);
});

export function getEquipment() {
  return equipment;
}

async function loadEquipment() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;
    const r = await fetch(`/api/characters/${characterId}/equipment`, { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    equipment = {};
    for (const slot of slots) {
      const it = data[slot];
      if (it) {
        equipment[slot] = {
          id: it.slug || it.item_id,
          name: it.name || it.slug,
          slot: slot,
          icon: it.icon_path || it.icon_url,
          qty: it.quantity || 1,
        };
        const cell = slotEls[slot];
        if (cell) updateCell(cell, equipment[slot]);
      }
    }
  } catch (err) {
    console.error('Failed to load equipment', err);
  }
}

loadEquipment();

