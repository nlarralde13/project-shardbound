/* inventory.js
   Renders the inventory grid and manages drag/drop reordering and unequip.
   Public events: dispatches 'inventory:add', 'inventory:unequip';
   listens for 'equip:changed'.
*/

import { API } from './api.js';

const grid = document.getElementById('inventory-grid');

// Current character inventory; populated from the server.
let inventory = [];


function render() {
  grid.innerHTML = '';
  inventory.forEach((item, idx) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.draggable = true;
    cell.dataset.index = idx;
    cell.style.backgroundImage = `url(${item.icon})`;
    cell.title = item.name;
    if (item.qty > 1) {
      const stack = document.createElement('span');
      stack.className = 'stack';
      stack.textContent = item.qty;
      cell.appendChild(stack);
    }

    cell.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ ...item, index: idx, from: 'inventory' }));
    });

    cell.addEventListener('dragover', (e) => e.preventDefault());
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.from === 'inventory') {
        const from = data.index;
        const to = idx;
        const [moved] = inventory.splice(from, 1);
        inventory.splice(to, 0, moved);
        render();
      } else if (data.from === 'paperdoll') {
        inventory.splice(idx, 0, data);
        render();
        document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot: data.slot } }));
      }
    });

    grid.appendChild(cell);
  });
}

grid.addEventListener('dragover', (e) => e.preventDefault());
grid.addEventListener('drop', (e) => {
  e.preventDefault();
  const text = e.dataTransfer.getData('text/plain');
  if (!text) return;
  const data = JSON.parse(text);
  if (data.from === 'paperdoll') {
    inventory.push(data);
    render();
    document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot: data.slot } }));
  }
});

document.addEventListener('inventory:add', (e) => {
  inventory.push(e.detail);
  render();
});

document.addEventListener('equip:changed', (e) => {
  const { item, previous } = e.detail;
  if (item.from === 'inventory') {
    inventory = inventory.filter((_, i) => i !== item.index);
  }
  if (previous) {
    inventory.push(previous);
  }
  render();
});

async function loadInventory() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;
    const r = await fetch(`/api/characters/${characterId}/inventory`, { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    inventory = (data.items || [])
      .filter(it => !it.slot)
      .map(it => ({
        id: it.slug || it.item_id,
        name: it.display_name || it.slug,
        slot: it.slot || null,
        icon: it.icon_url,
        qty: it.quantity || 1,
      }));
    render();
  } catch (err) {
    console.error('Failed to load inventory', err);
  }
}

loadInventory();


