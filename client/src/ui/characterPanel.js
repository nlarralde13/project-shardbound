// Character Panel (paper-doll) overlay
// API:
//   initCharacterPanel({ characterId, mountEl })
//   refreshCharacterPanel(force)

let _charId = null;
let _mount = null;
let _cache = { ts: 0, equipped: {} };

const SLOTS = [
  'head', 'chest', 'cloak', 'belt',
  'legs', 'feet', 'jewelry', 'gadget',
  'mainhand', 'offhand',
];

const LABELS = {
  head: 'Head', chest: 'Chest', cloak: 'Cloak', belt: 'Belt',
  legs: 'Legs', feet: 'Feet', jewelry: 'Jewelry', gadget: 'Gadget',
  mainhand: 'Main-hand', offhand: 'Off-hand',
};

const PLACEHOLDER_ICON = '/static/assets/chracter_models/placeholder_warrior.png';

function iconFor(item) {
  if (!item) return PLACEHOLDER_ICON;
  const direct = item.icon_url || item.icon_path;
  if (direct) return direct;
  const cat = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
  const row = cat.find(r => r.slug === (item.slug || item.item_slug));
  return row?.icon_path || PLACEHOLDER_ICON;
}

function _extractEquipped(list) {
  const out = {};
  for (const it of (list || [])) {
    const slot = (it.slot || '').toLowerCase();
    if (!slot) continue;
    if (!out[slot]) out[slot] = it;
  }
  return out;
}

function _render(equipped) {
  if (!_mount) return;

  // Build panel body (keep header/footer already in template)
  const panelBodyId = 'charPanelBody';
  let body = document.getElementById(panelBodyId);
  if (!body) {
    body = document.createElement('div');
    body.id = panelBodyId;
    body.className = 'char-panel';
    _mount.appendChild(body);
  }
  body.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'char-paperdoll';

  // Left column
  const left = document.createElement('div');
  left.className = 'col left';
  for (const s of ['head','chest','cloak','belt']) left.appendChild(_slotEl(s, equipped[s]));
  wrap.appendChild(left);

  // Center art
  const center = document.createElement('div');
  center.className = 'center';
  const ph = document.createElement('div'); ph.className = 'char-art';
  center.appendChild(ph);
  wrap.appendChild(center);

  // Right column
  const right = document.createElement('div');
  right.className = 'col right';
  for (const s of ['legs','feet','jewelry','gadget']) right.appendChild(_slotEl(s, equipped[s]));
  wrap.appendChild(right);

  // Bottom hands row
  const bottom = document.createElement('div');
  bottom.className = 'row bottom';
  bottom.appendChild(_slotEl('mainhand', equipped['mainhand']));
  bottom.appendChild(_slotEl('offhand', equipped['offhand']));
  wrap.appendChild(bottom);

  body.appendChild(wrap);
}

function _slotEl(slot, item) {
  const el = document.createElement('div');
  el.className = 'slot';
  el.dataset.slot = slot;

  const label = document.createElement('span');
  label.className = 'slot-label';
  label.textContent = LABELS[slot] || slot;
  el.appendChild(label);

  const box = document.createElement('button');
  box.type = 'button';
  box.className = 'slot-box';
  // Drag/drop target
  box.addEventListener('dragover', (ev) => {
    try { ev.preventDefault(); } catch {}
    const dt = ev.dataTransfer?.getData('application/json');
    let slug = null; try { slug = JSON.parse(dt||'{}')?.slug; } catch {}
    if (slug && _isCompatible(slug, slot)) box.classList.add('drop-ok'); else box.classList.add('drop-bad');
  });
  box.addEventListener('dragleave', ()=>{ box.classList.remove('drop-ok','drop-bad'); });
  box.addEventListener('drop', async (ev) => {
    ev.preventDefault(); box.classList.remove('drop-ok','drop-bad');
    let slug=null; try { slug = JSON.parse(ev.dataTransfer?.getData('application/json')||'{}')?.slug; } catch {}
    if (!slug) return;
    if (!_isCompatible(slug, slot)) { alert('Item cannot be equipped to this slot'); return; }
    try {
      const res = await fetch(`/api/characters/${_charId}/equip`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ slug, slot })});
      if (!res.ok) { const msg = await res.json().catch(()=>null); const err = (msg && (msg.message||msg.error)) || `HTTP ${res.status}`; alert(err); return; }
      window.dispatchEvent(new CustomEvent('equipment:changed'));
    } catch (e) { alert(e?.message || 'Failed to equip'); }
  });

  if (item) {
    const img = document.createElement('img');
    img.src = iconFor(item);
    img.alt = item.display_name || item.name || item.slug || 'Item';
    img.className = 'icon';
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_ICON; };
    box.appendChild(img);

    // Unequip button
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'unequip';
    x.textContent = '×';
    x.title = 'Unequip';
    x.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      try {
        const res = await fetch(`/api/characters/${_charId}/unequip`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        window.dispatchEvent(new CustomEvent('equipment:changed'));
      } catch (e) {
        alert(e?.message || 'Failed to unequip');
      }
    });
    el.appendChild(x);
  } else {
    box.textContent = '';
  }
  el.appendChild(box);

  return el;
}

function _isCompatible(slug, slot) {
  const cat = Array.isArray(window.__itemCatalog) ? window.__itemCatalog : [];
  const row = cat.find(r => r.slug === slug);
  if (!row) return false;
  const base = (row.slot || '').toLowerCase();
  if (!base) return false;
  if (base === slot) return true;
  const tags = Array.isArray(row.tags) ? row.tags.map(t => String(t).toLowerCase().replace(/[_-]/g,'')) : [];
  if (base === 'mainhand' && slot === 'offhand' && tags.includes('dualwieldok')) return true;
  if (row.type === 'shield' && slot === 'offhand') return true;
  return false;
}

export async function refreshCharacterPanel(force = false) {
  if (!_charId) return {};
  const maxAge = 30_000;
  const fresh = (Date.now() - _cache.ts) < maxAge;
  if (!force && fresh && _cache.equipped) { _render(_cache.equipped); return { equipped: _cache.equipped, cached: true }; }
  try {
    const r = await fetch(`/api/characters/${_charId}/inventory`, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = Array.isArray(json?.items) ? json.items : (Array.isArray(json) ? json : []);
    const equipped = _extractEquipped(items);
    _cache = { ts: Date.now(), equipped };
    _render(equipped);
    return { equipped };
  } catch (e) {
    // leave as-is
    return { error: true };
  }
}

export async function initCharacterPanel({ characterId, mountEl }) {
  _charId = characterId;
  _mount = mountEl;
  // ensure CSS root class exists
  if (_mount && !_mount.classList.contains('character-root')) _mount.classList.add('character-root');
  return refreshCharacterPanel(true);
}

// re-export for global access if needed
export default { initCharacterPanel, refreshCharacterPanel };
