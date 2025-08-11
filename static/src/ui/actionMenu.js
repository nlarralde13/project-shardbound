// ui/actionMenu.js
// 2×5 skill-driven action bar. Renders from playerProfile.skills.
// Fixed slots: [1]=Console (map views only), [10]=Explore (map views only).

import { skillCatalog } from '../data/skillCatalog.js';

let containerEl = null;
let profile = { id: 'Player', skills: [] };
let handlers = {};

const uc = (s='') => s.replace(/[_\-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const iconOf = (id) => skillCatalog[id]?.icon || '•';
const nameOf = (id) => skillCatalog[id]?.name || uc(id);

/** Public API **/
export function setActionProfile(p) {
  profile = { id: p?.id || 'Player', skills: Array.isArray(p?.skills) ? p.skills.slice() : [] };
}
export function setActionHandlers(on = {}) { handlers = on || {}; }

export function initActionBar({
  container = '#actionBar',
  playerProfile = profile,
  state = 'console',
  on = {},
} = {}) {
  containerEl = document.querySelector(container);
  if (!containerEl) throw new Error('[actionMenu] container not found');
  setActionProfile(playerProfile);
  setActionHandlers(on);

  // Ensure 2×5 grid consistently
  Object.assign(containerEl.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gridAutoRows: '44px',
    gap: '8px',
    justifyItems: 'center',
    alignItems: 'center',
  });

  renderActionBarFor(state);
}

export function renderActionBarFor(state = 'console') {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  const defs = computeActions(state, profile);
  const slots = normalizeToTen(defs);

  slots.forEach(def => {
    if (!def) {
      const spacer = document.createElement('div');
      spacer.style.width = '44px';
      spacer.style.height = '44px';
      containerEl.appendChild(spacer);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.dataset.action = def.id;
    btn.title = def.title || def.label;
    btn.setAttribute('aria-label', def.label);
    btn.textContent = def.icon || iconOf(def.id);
    btn.addEventListener('click', () => {
      const fn = def.onClick || handlers[def.id] || handlers.__skill__;
      if (typeof fn === 'function') fn(def);
    });
    containerEl.appendChild(btn);
  });
}

/* --------------------- internals --------------------- */

function computeActions(state, prof) {
  const A = [];

  // ---- ALWAYS render skills for the action bar (Gameboard or Map) ----
  // Console (gameboard): show FIRST 10 skills, no meta buttons.
  if (state === 'console') {
    const skills = Array.isArray(prof?.skills) ? prof.skills.slice(0, 10) : [];
    for (const id of skills) {
      A.push({ id, label: nameOf(id), icon: iconOf(id) });
    }
    return A;  // <-- important: nothing else in console
  }

  // Map views: show Console at slot 1, up to 8 skills, Explore at slot 10
  A.push({ id: 'console', label: 'Console', icon: '📜' });

  const skills = Array.isArray(prof?.skills) ? prof.skills.slice(0, 8) : [];
  for (const id of skills) {
    A.push({ id, label: nameOf(id), icon: iconOf(id) });
  }

  A.push({ id: 'explore', label: nameOf('explore'), icon: iconOf('explore') });
  return A;
}


function normalizeToTen(defs) {
  const out = defs.slice(0, 10);
  while (out.length < 10) out.push(null);

  // ensure slot 1 = console (if present), slot 10 = explore (if present)
  const idxC = out.findIndex(d => d && d.id === 'console');
  if (idxC > 0) { const d = out.splice(idxC, 1)[0]; out.unshift(d); out.length = 10; }
  const idxE = out.findIndex(d => d && d.id === 'explore');
  if (idxE !== -1 && idxE !== 9) { const d = out.splice(idxE, 1)[0]; out[9] = d; }
  return out.slice(0, 10);
}
