// /static/src/ui/char/characterPanel.js
// Minimal, flat Character drawer with Equipment/Stats tabs.
// Hotkey: 'C'. Exposes window.ui.CharacterPanel.toggle() in devMode.

import { computeDerived, itemLabel, itemTooltip } from './statsCalc.js';
import { getEquipment, getBaseStats, setEquipmentSlot, getPlayerName, getPlayerLevel } from '../../state/playerState.js';

const DEV_MODE = (new URLSearchParams(location.search).get('devMode') === '1');

let drawerEl = null;
let overlayEl = null;
let currentTab = 'equipment';
let mounted = false;

const SLOTS = [
  'head','neck','shoulders','back','chest','wrists','hands','waist','legs','feet',
  'ring1','ring2','trinket1','trinket2','mainHand','offHand'
];

function ensureMount() {
  if (mounted) return;
  // Drawer
  drawerEl = document.createElement('aside');
  drawerEl.id = 'characterDrawer';
  drawerEl.className = 'char-drawer hidden';

  drawerEl.innerHTML = `
    <div class="char-header">
      <div class="char-title">
        <span class="char-name">${getPlayerName()}</span>
        <span class="char-level">Lv ${getPlayerLevel()}</span>
      </div>
      <button class="char-close" title="Close (C)">✕</button>
    </div>
    <div class="char-tabs">
      <button data-tab="equipment" class="tab active">Equipment</button>
      <button data-tab="stats" class="tab">Stats</button>
    </div>
    <div class="char-content"></div>
  `;

  // Optional dim overlay for small screens (non-blocking, closes on click)
  overlayEl = document.createElement('div');
  overlayEl.id = 'characterOverlay';
  overlayEl.className = 'char-overlay hidden';

  document.body.appendChild(drawerEl);
  document.body.appendChild(overlayEl);

  drawerEl.querySelector('.char-close').addEventListener('click', toggle);
  drawerEl.querySelectorAll('.char-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  overlayEl.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
    }
  });

  mounted = true;
  render();
}

function switchTab(tab) {
  currentTab = tab;
  const tabs = drawerEl.querySelectorAll('.char-tabs .tab');
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderContent();
}

function renderContent() {
  const el = drawerEl.querySelector('.char-content');
  if (currentTab === 'equipment') {
    const eq = getEquipment();
    el.innerHTML = `
      <div class="char-eq-grid">
        ${SLOTS.map(slot => {
          const it = eq[slot] ?? null;
          const label = itemLabel(it);
          const tip = itemTooltip(it);
          return `
            <div class="eq-row" data-slot="${slot}">
              <div class="eq-slot">${niceSlot(slot)}</div>
              <div class="eq-item" title="${escapeAttr(tip)}">${label}</div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="char-paperdoll">
        <!-- Optional static silhouette; replace with SVG if desired -->
        <div class="doll-silhouette" aria-hidden="true"></div>
      </div>
    `;
    // (Optional) Click handler stub for future: equip via setEquipmentSlot
    el.querySelectorAll('.eq-row').forEach(row => {
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Example dev stub: right-click clears slot
        const slot = row.dataset.slot;
        setEquipmentSlot(slot, null);
        renderContent();
      });
    });

  } else {
    const base = getBaseStats();
    const derived = computeDerived(base, getEquipment());
    el.innerHTML = `
      <div class="stats-group">
        <h4>Base</h4>
        <div class="stats-grid">
          ${statRow('Level', base.level)}
          ${statRow('STR', base.str)}${statRow('AGI', base.agi)}${statRow('INT', base.int)}
          ${statRow('STA', base.sta)}${statRow('Spirit', base.spirit)}
          ${statRow('Armor', base.armor)}${statRow('Power', base.power)}
          ${statRow('Crit %', (base.crit*100).toFixed(1))}${statRow('Dodge %', (base.dodge*100).toFixed(1))}
        </div>
      </div>
      <div class="stats-group">
        <h4>Derived</h4>
        <div class="stats-grid">
          ${statRow('HP Max', derived.hpMax)}
          ${statRow('MP Max', derived.mpMax)}
          ${statRow('Attack Power', derived.attackPower)}
          ${statRow('Spell Power', derived.spellPower)}
          ${statRow('Crit %', derived.critPct.toFixed(1))}
          ${statRow('Dodge %', derived.dodgePct.toFixed(1))}
          ${statRow('Carry Cap', Math.round(derived.carryCap))}
        </div>
      </div>
    `;
  }
}

function statRow(label, val) {
  return `<div class="stat"><span>${label}</span><strong>${val}</strong></div>`;
}

function niceSlot(id) {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .replace('1',' 1').replace('2',' 2').trim();
}

function escapeAttr(s='') {
  return String(s).replace(/"/g, '&quot;');
}

function render() {
  if (!mounted) return;
  // Header name/level refresh (in case level/name changed)
  drawerEl.querySelector('.char-name').textContent = getPlayerName();
  drawerEl.querySelector('.char-level').textContent = `Lv ${getPlayerLevel()}`;
  switchTab(currentTab); // will render content
}

function open() {
  ensureMount();
  drawerEl.classList.remove('hidden');
  overlayEl.classList.remove('hidden');
  render();
}

function close() {
  if (!mounted) return;
  drawerEl.classList.add('hidden');
  overlayEl.classList.add('hidden');
}

function toggle() {
  ensureMount();
  if (drawerEl.classList.contains('hidden')) open(); else close();
}

function bindButton() {
  const btn = document.getElementById('btnCharacter');
  if (btn) btn.addEventListener('click', toggle);
}

// Public init
export function initCharacterPanel() {
  ensureMount();
  bindButton();
}

// Dev helpers
if (DEV_MODE) {
  globalThis.ui = globalThis.ui || {};
  globalThis.ui.CharacterPanel = { open, close, toggle, render, refresh: render };
}

