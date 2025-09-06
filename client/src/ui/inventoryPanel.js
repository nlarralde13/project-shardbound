// Inventory Overlay renderer (overlay-only)
// Exposes: initInventoryOverlay({ characterId, mountEl }), open/close/refresh helpers

let _mount = null;
let _charId = null;
let _cache = { ts: 0, items: [], equipped: [] };
let _prefs = { showEquippedInBag: false };
const PREFS_KEY = 'inv_show_equipped';

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

function compatSlotsFor(item) {
  const catalog = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
  const row = catalog.find(r => r.slug === (item.slug || item.item_slug));
  const slot = (row?.slot || '').toLowerCase();
  if (!slot) return [];
  const tags = Array.isArray(row?.tags) ? row.tags.map(t => String(t).toLowerCase().replace(/[_-]/g,'')) : [];
  if (slot === 'mainhand' && tags.includes('dualwieldok')) return ['mainhand', 'offhand'];
  return [slot];
}

function renderGrid(items, equippedList=[]) {
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
    btn.draggable = !!it;
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

    // Drag start payload
    btn.addEventListener('dragstart', (ev) => {
      try { ev.dataTransfer?.setData('application/json', JSON.stringify({ slug: it.slug })); } catch {}
      ev.dataTransfer?.setData('text/plain', it.slug);
      ev.dataTransfer?.setDragImage?.(img, 16, 16);
    });

    // Action menu (right-click or ellipsis)
    const menuBtn = document.createElement('span');
    menuBtn.className = 'menu-btn';
    menuBtn.textContent = '…';
    btn.appendChild(menuBtn);

    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenus();
      const menu = document.createElement('div');
      menu.className = 'inv-menu';
      const addItem = (label, handler, disabled=false) => {
        const a = document.createElement('button');
        a.type = 'button'; a.textContent = label; a.disabled = disabled;
        a.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); closeMenus(); handler?.(); });
        menu.appendChild(a);
      };

      // Use
      const catalog = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
      const row = catalog.find(r => r.slug === (it.slug || it.item_slug));
      const hasUse = row && row.on_use && Object.keys(row.on_use||{}).length>0;
      addItem('Use', () => alert('TODO: Implement use'), !hasUse);

      // Equip
      const slots = compatSlotsFor(it);
      if (slots.length <= 1) {
        const slot = slots[0];
        const label = slot ? `Equip to ${slot === 'mainhand' ? 'main-hand' : (slot==='offhand'?'off-hand':slot)}` : 'Equip';
        addItem(label, () => doEquip(it, slot), !slot || !!it.equipped);
      } else {
        for (const s of slots) {
          const label = `Equip to ${s === 'mainhand' ? 'main-hand' : (s==='offhand'?'off-hand':s)}`;
          addItem(label, () => doEquip(it, s), !!it.equipped);
        }
      }

      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      menu.style.left = `${Math.round(rect.left + window.scrollX + rect.width - 4)}px`;
      menu.style.top  = `${Math.round(rect.top + window.scrollY + 4)}px`;
      setTimeout(()=>{
        const onDoc = (ev2)=>{ if (!menu.contains(ev2.target)) { closeMenus(); document.removeEventListener('mousedown', onDoc, true); } };
        document.addEventListener('mousedown', onDoc, true);
      }, 0);
    };
    const closeMenus = () => { document.querySelectorAll('.inv-menu').forEach(n=>n.remove()); };
    menuBtn.addEventListener('click', openMenu);
    btn.addEventListener('contextmenu', openMenu);

    grid.appendChild(btn);
  }

  if (count === 0) {
    const err = document.createElement('div');
    err.className = 'inv-error';
    err.textContent = 'Bag is empty.';
    _mount.appendChild(err);
  }

  // Equipped list (optional panel below; does not consume capacity)
  if (Array.isArray(equippedList) && equippedList.length && _prefs.showEquippedInBag) {
    const sep = document.createElement('div'); sep.className='inv-sep'; sep.textContent='Equipped'; _mount.appendChild(sep);
    const grid2 = document.createElement('div'); grid2.className='inv-grid equipped-grid'; _mount.appendChild(grid2);
    for (const it of equippedList) {
      const name = it.display_name || it.name || it.slug || 'Item';
      const btn = document.createElement('button'); btn.type='button'; btn.className='slot'; btn.title = toTooltip(it);
      const img = document.createElement('img'); img.className='icon'; img.src = iconFor(it); img.alt = name; img.onerror = ()=>{ img.onerror=null; img.src=PLACEHOLDER_ICON; };
      btn.appendChild(img);
      const e = document.createElement('span'); e.className='equipped'; e.textContent='E'; btn.appendChild(e);
      grid2.appendChild(btn);
    }
  }
}

async function doEquip(item, slot) {
  try {
    const res = await fetch(`/api/characters/${_charId}/equip`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: item.slug, slot })
    });
    if (!res.ok) {
      const msg = await res.json().catch(()=>null);
      let err = (msg && (msg.message || msg.error)) || `HTTP ${res.status}`;
      if (msg && msg.reason === 'offhand_occupied') err = 'Two-handed weapons require both hands free.';
      alert(err);
      return;
    }
    window.dispatchEvent(new CustomEvent('equipment:changed'));
  } catch (e) { alert(e?.message || 'Failed to equip'); }
}

export async function refreshInventoryOverlay(force = false) {
  if (!_charId) return { items: [] };
  const maxAge = 60_000; // 60s
  const fresh = (now() - _cache.ts) < maxAge;
  if (!force && fresh && _cache.items.length) {
    renderGrid(_cache.items, _cache.equipped);
    return { items: _cache.items, cached: true };
  }
  try {
    const res = await fetch(`/api/characters/${_charId}/inventory`, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
    const equipped = rows.filter(it => it.equipped);
    const items = rows.filter(it => !it.equipped);
    _cache = { ts: now(), items, equipped };
    renderGrid(items, equipped);
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

  // Insert UI toggle into header
  try {
    const header = document.querySelector('#overlayInventory .panel-header');
    if (header && !header.querySelector('#toggleShowEquipped')) {
      const wrap = document.createElement('label');
      wrap.className = 'dim';
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id='toggleShowEquipped';
      const saved = localStorage.getItem(PREFS_KEY);
      _prefs.showEquippedInBag = saved === '1';
      cb.checked = _prefs.showEquippedInBag;
      const txt = document.createElement('span'); txt.textContent = 'Show equipped';
      cb.addEventListener('change', ()=>{
        _prefs.showEquippedInBag = !!cb.checked; localStorage.setItem(PREFS_KEY, _prefs.showEquippedInBag ? '1' : '0');
        renderGrid(_cache.items, _cache.equipped);
      });
      wrap.appendChild(cb); wrap.appendChild(txt);
      header.querySelector('div[style]')?.prepend(wrap);
    }
  } catch {}

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

