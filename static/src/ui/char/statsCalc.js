// /static/src/ui/char/statsCalc.js
// Pure utilities for computing derived stats from base + equipment.

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function addStats(a = {}, b = {}) {
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}

export function sumEquipmentBonuses(equipment = {}) {
  // Items are expected to be objects like: { name:'...', bonuses:{ str:+2, sta:+3, armor:15, crit:0.01, weight:2 } }
  const totals = {};
  for (const slot of Object.keys(equipment)) {
    const it = equipment[slot];
    if (it?.bonuses && typeof it.bonuses === 'object') {
      Object.assign(totals, addStats(totals, it.bonuses));
    }
  }
  return totals;
}

export function computeDerived(base = {}, equipment = {}) {
  // Effective = base + equip bonuses (for overlapping keys)
  const bonus = sumEquipmentBonuses(equipment);
  const eff = { ...base };
  for (const k of ['str','agi','int','sta','spirit','armor','power','crit','dodge'] ) {
    if (bonus[k] != null) eff[k] = (eff[k] ?? 0) + bonus[k];
  }

  const weight = bonus.weight ?? 0;

  const hpMax = 100 + (eff.sta ?? 0) * 10;
  const mpMax = 50 + (eff.int ?? 0) * 12 + (eff.spirit ?? 0) * 8;
  const attackPower = (eff.str ?? 0) * 2 + (eff.power ?? 0);
  const spellPower  = (eff.int ?? 0) * 2 + (eff.spirit ?? 0) * 1;
  const critPct  = clamp(((eff.crit ?? 0) * 100), 0, 100);
  const dodgePct = clamp(((eff.dodge ?? 0) * 100), 0, 100);
  const carryCap = Math.max(0, 50 + (eff.str ?? 0) * 1.5 + (eff.agi ?? 0) * 0.5 - (weight * 0.5));

  return { hpMax, mpMax, attackPower, spellPower, critPct, dodgePct, carryCap };
}

export function itemLabel(item) {
  if (!item) return '—';
  return item.name ?? 'Unnamed Item';
}

export function itemTooltip(item) {
  if (!item) return '';
  try {
    return JSON.stringify(item, null, 2);
  } catch { return String(item); }
}
