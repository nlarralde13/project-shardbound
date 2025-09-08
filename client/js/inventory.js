// static/js/inventory.js
import { API } from './api.js';

const grid = document.getElementById('inventory-grid');
const FALLBACK_ICON = '/static/assets/items/_fallback.png';

let inventory = [];

function normalizeItem(it) {
  const slug = it.slug || it.name || it.display_name || '';
  const inferred = slug ? `/static/assets/items/${String(slug).toLowerCase().replace(/\s+/g,'_').replace(/-/g,'_')}.png` : FALLBACK_ICON;
  return {
    id: it.character_item_id || it.id || it.slug || it.item_id || slug,
    name: it.display_name || it.name || slug || 'Item',
    slot: it.slot || null,
    icon: it.icon_url || it.icon_path || inferred || FALLBACK_ICON,
    qty: it.quantity ?? it.qty ?? 1,
    rarity: it.rarity || null,
    character_item_id: it.character_item_id || it.id,
    slug,
  };
}

function makeCell(item, idx) {
  const cell = document.createElement('div');
  cell.className = 'inv-cell';

  const img = document.createElement('img');
  img.draggable = true;
  img.alt = item.name || '';
  img.src = item.icon || FALLBACK_ICON;
  cell.appendChild(img);

  if ((item.qty ?? 1) > 1) {
    const b = document.createElement('span');
    b.className = 'qty';
    b.textContent = String(item.qty);
    cell.appendChild(b);
  }

  // drag payload includes character_item_id (or slug fallback)
  cell.addEventListener('dragstart', (e) => {
    const payload = { index: idx, from: 'inventory' };
    if (item.character_item_id != null) payload.character_item_id = item.character_item_id;
    else if (item.slug) payload.slug = item.slug;
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  });

  // reorder within inventory; if a paperdoll item drops here -> unequip
  cell.addEventListener('dragover', (e) => e.preventDefault());
  cell.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const data = JSON.parse(text);

    if (data.from === 'inventory') {
      const from = data.index;
      const to = idx;
      const [moved] = inventory.splice(from, 1);
      inventory.splice(to, 0, moved);
      render();
    } else if (data.from === 'paperdoll') {
      document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot: data.slot } }));
    }
  });

  return cell;
}

function render() {
  if (!grid) return;
  grid.innerHTML = '';
  inventory.forEach((it, i) => grid.appendChild(makeCell(it, i)));
}

function applyLoadout(dto) {
  const items = Array.isArray(dto?.inventory) ? dto.inventory : [];
  const keyOf = (it) => String(it?.character_item_id ?? it?.id ?? it?.slug ?? "");
  const equippedKeys = new Set(Object.values(dto?.equipped || {}).map(keyOf));
  inventory = items
    .filter(it => !equippedKeys.has(keyOf(it)))
    .map(normalizeItem);
  render();
}


async function loadInventory() {
  try {
    const active = await API.characterActive();
    const characterId = active?.character_id || active?.id;
    if (!characterId) return;
    const dto = await API.loadout(characterId);
    applyLoadout(dto);
  } catch (err) {
    console.error('[inventory] load failed', err);
  }
}

// Drop-to-background to unequip
if (grid) {
  grid.addEventListener('dragover', (e) => e.preventDefault());
  grid.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const data = JSON.parse(text);
    if (data.from === 'paperdoll') {
      document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot: data.slot } }));
    }
  });
}

loadInventory();
window.addEventListener('character:ready', loadInventory);
document.addEventListener('loadout:updated', (e) => applyLoadout(e.detail || {}));
