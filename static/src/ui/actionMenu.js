// ui/actionMenu.js
// 2×5, skill-driven action bar.
// Map views: [slot1]=Back (if slice/room) else Console, [slot10]=Explore.

import { skillCatalog } from '../data/skillCatalog.js';

let containerEl = null;
let profile = { id: 'Player', skills: [] };
let handlers = {};

const uc = (s='') => s.replace(/[_\-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const iconOf = (id) => skillCatalog[id]?.icon || '•';
const nameOf = (id) => skillCatalog[id]?.name || uc(id);

/* ─── Public API ─────────────────────────────────────────────── */

export function setActionProfile(p) {
  profile = {
    id: p?.id || 'Player',
    skills: Array.isArray(p?.skills) ? p.skills.slice() : []
  };
}

export function setActionHandlers(on = {}) {
  handlers = on || {};
}

/**
 * Initialize the bar and render once.
 */
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

  // 2×5 grid
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

/**
 * Re-render for a given state.
 * Pass { on } to refresh handlers each time (prevents stale callbacks).
 */
export function renderActionBarFor(state = 'console', opts = {}) {
  if (opts.on) setActionHandlers(opts.on);
  if (!containerEl) return;

  containerEl.innerHTML = '';

  const defs  = computeActions(state, profile);
  const slots = normalizeToTen(defs);

  slots.forEach(def => {
    if (!def) {
      // spacer to preserve layout
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
      // Debug trace to make routing obvious while we tune UX
      console.log('[actionMenu] click:', def.id, def.label || def.title);

      // Explicit routing for system actions
      if (def.id === 'back'    && typeof handlers.back    === 'function') return handlers.back(def);
      if (def.id === 'explore' && typeof handlers.explore === 'function') return handlers.explore(def);
      if (def.id === 'console' && typeof handlers.console === 'function') return handlers.console(def);

      // Skills/custom
      const fn = def.onClick || handlers[def.id] || handlers.__skill__;
      if (typeof fn === 'function') return fn(def);

      console.warn('[actionMenu] no handler for', def.id);
    });

    containerEl.appendChild(btn);
  });
}

/* ─── Internals ─────────────────────────────────────────────── */

function computeActions(state, prof) {
  const A = [];

  // Console (gameboard): 10 skills only
  if (state === 'console') {
    const skills = Array.isArray(prof?.skills) ? prof.skills.slice(0, 10) : [];
    for (const id of skills) {
      A.push({ id, label: nameOf(id), icon: iconOf(id) });
    }
    return A;
  }

  // Map views (shard/slice/room)
  const isSlice = state === 'slice';
  const isRoom  = state === 'room';

  if (isSlice || isRoom) {
    A.push({ id: 'back', label: 'Back', icon: '↩️' });    // left-most
  }

  A.push({ id: 'console', label: 'Console', icon: '📜' });

  const skills = Array.isArray(prof?.skills) ? prof.skills.slice(0, 8) : [];
  for (const id of skills) {
    A.push({ id, label: nameOf(id), icon: iconOf(id) });
  }

  A.push({ id: 'explore', label: nameOf('explore'), icon: iconOf('explore') }); // right-most
  return A;
}

/**
 * Enforce 10 slots:
 *  - slot 1 = Back (if present) else Console
 *  - slot 10 = Explore (if present)
 */
function normalizeToTen(defs) {
  const out = defs.slice(0, 10);
  while (out.length < 10) out.push(null);

  // slot 1
  const idxBack = out.findIndex(d => d && d.id === 'back');
  const idxCon  = out.findIndex(d => d && d.id === 'console');
  if (idxBack > -1 && idxBack !== 0) {
    const d = out.splice(idxBack, 1)[0];
    out.unshift(d);
    out.length = 10;
  } else if (idxBack === -1 && idxCon > 0) {
    const d = out.splice(idxCon, 1)[0];
    out.unshift(d);
    out.length = 10;
  }

  // slot 10
  const idxExp = out.findIndex(d => d && d.id === 'explore');
  if (idxExp !== -1 && idxExp !== 9) {
    const d = out.splice(idxExp, 1)[0];
    out[9] = d;
  }

  return out.slice(0, 10);
}
