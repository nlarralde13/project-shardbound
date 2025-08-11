// state/playerProfile.js
// Tiny store for the active player profile (class, stats, skills).
// Persists to localStorage and notifies listeners on change.

import { classTemplates } from '../data/classTemplates.js';

const LS_KEY = 'sb_profile';
const listeners = new Set();

let profile = null;
let dev = false;

export function setDevMode(on = true) { dev = !!on; }
export function isDev() { return dev; }
export function canSwapClass() { return dev; }

export function onProfileChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(profile); }
function save() { localStorage.setItem(LS_KEY, JSON.stringify(profile)); }

export function getProfile() {
  if (profile) return profile;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) profile = JSON.parse(raw);
  } catch {}
  if (!profile) loadClass('fighter', { silent: true }); // default
  return profile;
}

export function loadClass(classId, { silent = false } = {}) {
  const tmpl = classTemplates[classId];
  if (!tmpl) throw new Error(`Unknown class: ${classId}`);
  profile = {
    id: classId,
    name: tmpl.name,
    level: 1,
    stats: { ...tmpl.stats },       // { hp, mp, sp }
    skills: [...(tmpl.skills || [])],
    items:  [...(tmpl.items  || [])],
    perks:  [...(tmpl.perks  || [])],
  };
  save();
  if (!silent) emit();
  return profile;
}
