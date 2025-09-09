// static/js/inventory.js
import { API } from './api.js';

const grid = document.getElementById('inventory-grid');
const FALLBACK_ICON = '/static/assets/items/_fallback.png';

let inventory = [];

// Stable key for DOM reuse
const nodeById = new Map();
const keyOf = (it) => String(it?.character_item_id ?? it?.id ?? it?.slug ?? "");
const FALLBACK_ICON = '/static/assets/items/_fallback.png';

function getCellIndex(el) {
  const cell = el.closest('.inv-cell');
  if (!cell || !grid) return -1;
  return Array.prototype.indexOf.call(grid.children, cell);
}


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

function makeCell(item) {
  const id = keyOf(item);
  const cell = document.createElement('div');
  cell.className = 'inv-cell';
  cell.dataset.id = id;

  const img = document.createElement('img');
  img.draggable = true;
  img.alt = item.name || '';
  img.src = item.icon || FALLBACK_ICON;
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_ICON; };
  cell.appendChild(img);

  const qty = document.createElement('span');
  qty.className = 'qty';
  cell.appendChild(qty);

  // Drag start: compute index *at drag time* so it’s never stale
  cell.addEventListener('dragstart', (e) => {
    const from = getCellIndex(e.target);
    const payload = {
      index: from,
      from: 'inventory',
      character_item_id: item.character_item_id ?? null,
      id
    };
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  });

  // Allow drops
  cell.addEventListener('dragover', (e) => e.preventDefault());

  // Drop: compute target index from DOM
  cell.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    let data;
    try { data = JSON.parse(text); } catch { return; }

    const to = getCellIndex(e.target);
    if (to < 0) return;

    if (data.from === 'inventory') {
      const from = data.index;
      if (from >= 0 && from !== to) {
        const [moved] = inventory.splice(from, 1);
        inventory.splice(to, 0, moved);
        // Re-render will reuse nodes and just reorder them
        render();
      }
    } else if (data.from === 'paperdoll') {
      document.dispatchEvent(new CustomEvent('inventory:unequip', { detail: { slot: data.slot } }));
    }
  });

  return cell;
}

function updateCell(cell, item) {
  // id already set in makeCell
  const img = cell.querySelector('img');
  if (img && img.src !== (item.icon || FALLBACK_ICON)) {
    img.src = item.icon || FALLBACK_ICON;
  }

  const qtyEl = cell.querySelector('.qty');
  const q = Number(item.qty ?? 1);
  if (q > 1) {
    qtyEl.textContent = String(q);
    qtyEl.style.display = '';
  } else {
    qtyEl.textContent = '';
    qtyEl.style.display = 'none';
  }
}



function render() {
  if (!grid) return;

  const frag = document.createDocumentFragment();
  const seen = new Set();

  // Build in desired order, reusing nodes when possible
  for (const it of inventory) {
    const id = keyOf(it);
    let cell = nodeById.get(id);
    if (!cell) {
      cell = makeCell(it);
      nodeById.set(id, cell);
    }
    updateCell(cell, it);
    frag.appendChild(cell);
    seen.add(id);
  }

  // Clean up removed items
  for (const id of nodeById.keys()) {
    if (!seen.has(id)) nodeById.delete(id);
  }

  // One atomic swap keeps layout stable and fast
  grid.replaceChildren(frag);
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
