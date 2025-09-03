// Simple inventory panel for the demo. Uses only browser features.

let _mount = null;
let _charId = null;

// Fetch and render the inventory grid
export async function initInventoryPanel({ characterId, mountEl }) {
  _charId = characterId;
  _mount = mountEl;
  await refreshInventory(characterId);
}

export async function refreshInventory(characterId = _charId) {
  if (!_mount) return;
  const res = await fetch(`/api/characters/${characterId}/inventory`);
  const data = await res.json();
  render(data.items || []);
  return data;
}

export async function addItem(characterId, itemSlug, qty = 1) {
  await fetch(`/api/characters/${characterId}/inventory/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_slug: itemSlug, quantity: qty })
  });
  return refreshInventory(characterId);
}

export async function removeItem(characterId, itemSlug, qty = 1) {
  await fetch(`/api/characters/${characterId}/inventory/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_slug: itemSlug, quantity: qty })
  });
  return refreshInventory(characterId);
}

function render(items) {
  _mount.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'inventory-panel';

  const header = document.createElement('div');
  header.className = 'inventory-header';
  header.textContent = 'Inventory';
  panel.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'inventory-grid';
  panel.appendChild(grid);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-msg';
    empty.textContent = 'Bag is empty.';
    grid.appendChild(empty);
  }

  for (const it of items) {
    const slot = document.createElement('div');
    slot.className = `inv-slot rarity-${it.rarity}`;

    const img = document.createElement('img');
    img.src = it.icon_url;
    img.alt = it.display_name;
    img.className = 'inventory-icon';
    img.title = `${it.display_name} (${it.rarity})\n${it.description || ''}`;
    img.onerror = () => {
      img.onerror = null;
      img.src = '/static/assets/items/_fallback.png';
    };
    slot.appendChild(img);

    if (it.quantity > 1) {
      const badge = document.createElement('span');
      badge.className = 'qty-badge';
      badge.textContent = it.quantity;
      slot.appendChild(badge);
    }

    grid.appendChild(slot);
  }

  _mount.appendChild(panel);
}

