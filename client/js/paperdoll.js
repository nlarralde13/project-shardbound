/* paperdoll.js
   Builds equipment slots and handles equip/unequip via drag & drop.
   Public events: dispatches 'equip:changed'; listens for 'inventory:unequip'.
*/

const slots = ['head','cloak','chest','belt','pants','boots','mainhand','offhand','jewelry','gadget'];
const equipment = {
  chest: { id: 'leather_jerkin', name: 'Leather Jerkin', slot: 'chest', icon: '/static/assets/items/leather_jerkin.png', qty: 1 },
  mainhand: { id: 'iron_sword', name: 'Iron Sword', slot: 'mainhand', icon: '/static/assets/items/iron_sword.png', qty: 1 },
  offhand: { id: 'buckler', name: 'Buckler', slot: 'offhand', icon: '/static/assets/items/buckler.png', qty: 1 }
};

const doll = document.getElementById('paperdoll');

slots.forEach(slot => {
  const cell = document.createElement('div');
  cell.className = 'equip-slot';
  cell.dataset.slot = slot;
  cell.draggable = true;
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

