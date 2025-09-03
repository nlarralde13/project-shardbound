// Inventory Overlay renderer (overlay-only)
// Exposes: initInventoryOverlay({ characterId, mountEl }), open/close/refresh helpers

let _mount = null;
let _charId = null;
let _cache = { ts: 0, items: [] };

const PLACEHOLDER_ICON = '/static/assets/items/_fallback.png';

function now() { return Date.now(); }

function getCapacity() {
  try {
    const c = (window.__activeCharacter || {}).capacity;
    const inv = c && Number.isFinite(c.inventory) ? c.inventory : null;
    return inv || 12;
  } catch { return 12; }
}

function toTooltip(item) {
  const catalog = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
  const row = catalog.find(r => r.slug === (item.slug || item.item_slug));
  const name = item.display_name || item.name || row?.name || 'Unknown';
  const type = row?.type || '';
  const slot = row?.slot || '';
  let statStr = '';
  if (row && row.stats && typeof row.stats === 'object') {
    const k = Object.keys(row.stats)[0];
    if (k) statStr = `${k}: ${row.stats[k]}`;
  }
  let action = '';
  if (Array.isArray(row?.on_use) && row.on_use.length) action = 'Use: see details';
  else if (Array.isArray(row?.on_equip) && row.on_equip.length) action = 'Equip: see details';
  return [name, [type, slot].filter(Boolean).join(' • '), statStr, action].filter(Boolean).join('\n');
}

function iconFor(item) {
  const direct = item.icon_url || item.icon_path;
  if (direct) return direct;
  const catalog = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
  const row = catalog.find(r => r.slug === (item.slug || item.item_slug));
  return row?.icon_path || PLACEHOLDER_ICON;
}

function renderGrid(items) {
  if (!_mount) return;
  const capacity = getCapacity();
  const count = Array.isArray(items) ? items.length : 0;
  const header = document.getElementById('invHeaderTitle');
  if (header) header.textContent = `Inventory (${capacity})`;

  // mount content
  _mount.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  _mount.appendChild(grid);

  // Render fixed number of slots
  for (let i = 0; i < capacity; i++) {
    const it = items[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot' + (it ? '' : ' empty');
    btn.tabIndex = 0;
    if (!it) {
      btn.setAttribute('aria-label', `Empty slot ${i + 1}`);
      grid.appendChild(btn);
      continue;
    }

    const name = it.display_name || it.name || it.slug || 'Item';
    const qty = Number(it.quantity || 1);
    btn.setAttribute('aria-label', `${name}${qty > 1 ? `, quantity ${qty}` : ''}`);
    btn.title = toTooltip(it);

    const img = document.createElement('img');
    img.className = 'icon';
    img.src = iconFor(it);
    img.alt = name;
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_ICON; };
    btn.appendChild(img);

    if (qty > 1) {
      const q = document.createElement('span');
      q.className = 'qty';
      q.textContent = String(qty);
      btn.appendChild(q);
    }

    if (it.equipped) {
      const e = document.createElement('span');
      e.className = 'equipped';
      e.textContent = 'E';
      btn.appendChild(e);
    }

    // Stub action menu (future use/equip)
    btn.addEventListener('click', () => {
      // TODO: open contextual menu with Use/Equip
    });

    grid.appendChild(btn);
  }

  if (count === 0) {
    const err = document.createElement('div');
    err.className = 'inv-error';
    err.textContent = 'Bag is empty.';
    _mount.appendChild(err);
  }
}

export async function refreshInventoryOverlay(force = false) {
  if (!_charId) return { items: [] };
  const maxAge = 60_000; // 60s
  const fresh = (now() - _cache.ts) < maxAge;
  if (!force && fresh && _cache.items.length) {
    renderGrid(_cache.items);
    return { items: _cache.items, cached: true };
  }
  try {
    const res = await fetch(`/api/characters/${_charId}/inventory`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
    _cache = { ts: now(), items };
    renderGrid(items);
    return { items };
  } catch (e) {
    if (_mount) {
      _mount.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'inv-error';
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = 'Retry';
      a.addEventListener('click', (ev) => { ev.preventDefault(); refreshInventoryOverlay(true); });
      msg.appendChild(document.createTextNode('Failed to load inventory. '));
      msg.appendChild(a);
      _mount.appendChild(msg);
    }
    return { items: [], error: true };
  }
}

export function initInventoryOverlay({ characterId, mountEl }) {
  _charId = characterId;
  _mount = mountEl;

  // Wire header refresh if present
  const btn = document.getElementById('btnInvRefresh');
  btn?.addEventListener('click', () => refreshInventoryOverlay(true));

  return refreshInventoryOverlay(true);
}

export function openInventoryOverlay() {
  const overlay = document.getElementById('overlayInventory');
  overlay?.classList.remove('hidden');
  return refreshInventoryOverlay(false);
}

export function closeInventoryOverlay() {
  const overlay = document.getElementById('overlayInventory');
  overlay?.classList.add('hidden');
}

