// Minimal player state for MVP1 combat mock.
const NS = 'sb_player_state_v1';

const DEFAULT = {
  name: 'Wanderer',
  hp: 20,
  maxHp: 20,
  atk: 5,           // base damage per hit
  critChance: 0.1,  // 10%
  inventory: []     // strings for loot
};

function load() {
  try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(NS) || '{}')) }; }
  catch { return { ...DEFAULT }; }
}
function save(state) { localStorage.setItem(NS, JSON.stringify(state)); }

let state = load();

export function getPlayer() { return state; }
export function healToFull() { state.hp = state.maxHp; save(state); }
export function damagePlayer(amount) {
  state.hp = Math.max(0, state.hp - amount);
  save(state);
  return state.hp;
}
export function addLoot(items) {
  if (!items || !items.length) return;
  state.inventory.push(...items);
  save(state);
}
export function resetPlayer() { state = { ...DEFAULT }; save(state); }
