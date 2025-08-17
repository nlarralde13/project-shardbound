// /static/src/state/playerState.js
// Centralized player state with localStorage persistence + shims for combat/travel/slice/HUD.
// No imports to avoid circular dependencies. Call setRedraw(fn) from your app to refresh UI.

const STORE_KEY = "sb_player_state_v4";

// ---------------------------- Internal helpers -------------------------------
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRaw(obj) {
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}

// ------------------------------ Default state --------------------------------
const DEFAULT_STATE = {
  // world position in shard coords
  position: { x: 0, y: 0 },

  // core stats
  stats: { hp: 100, maxHp: 100 },

  // NEW: magic points
  mp: 100,
  maxMp: 100,

  // stamina (used by travel and slice movement)
  stamina: 100,
  maxStamina: 100,

  // restful items usable in the field
  restItems: 2,

  // loot inventory: keep array for simple UI, can migrate to map later
  inventory: [], // e.g., ["herb_common","ore_copper"]

  // last 5 ambush outcomes; used for anti-frustration bias
  lastAmbushes: [false, false, false, false, false],

  // last town tile (for defeat fallback)
  lastTownTile: null, // {x,y} or null

  // id for deterministic RNG
  playerId: "localDevPlayer",

  // optional UI redraw hook
  _redrawFn: null
};

// ------------------------------- Live state ----------------------------------
let _state = (() => {
  const fromDisk = loadRaw();
  if (!fromDisk) return { ...DEFAULT_STATE };
  // Shallow migrate for safety
  return {
    ...DEFAULT_STATE,
    ...fromDisk,
    stats: { ...DEFAULT_STATE.stats, ...(fromDisk.stats || {}) },
    lastAmbushes: Array.isArray(fromDisk.lastAmbushes)
      ? fromDisk.lastAmbushes.slice(-5)
      : [...DEFAULT_STATE.lastAmbushes],
    // Ensure new fields exist after migration
    mp: typeof fromDisk.mp === "number" ? fromDisk.mp : DEFAULT_STATE.mp,
    maxMp: typeof fromDisk.maxMp === "number" ? fromDisk.maxMp : DEFAULT_STATE.maxMp,
    stamina: typeof fromDisk.stamina === "number" ? fromDisk.stamina : DEFAULT_STATE.stamina,
    maxStamina: typeof fromDisk.maxStamina === "number" ? fromDisk.maxStamina : DEFAULT_STATE.maxStamina,
  };
})();

function persist() { saveRaw(_state); }
function redraw() { if (typeof _state._redrawFn === "function") _state._redrawFn(); }

// ----------------------------- Core API (object) -----------------------------
export const playerState = {
  // subscribe a UI redraw function (optional)
  setRedraw(fn) { _state._redrawFn = typeof fn === "function" ? fn : null; },

  // ----- position
  getPosition() { return { ..._state.position }; },
  setPosition(x, y) {
    _state.position = { x: Math.floor(x), y: Math.floor(y) };
    persist(); redraw();
  },

  // ----- HP
  getHP() { return _state.stats.hp; },
  setHP(value) {
    _state.stats.hp = clamp(value, 0, _state.stats.maxHp);
    persist(); redraw();
    return _state.stats.hp;
  },
  healFull() { _state.stats.hp = _state.stats.maxHp; persist(); redraw(); return _state.stats.hp; },

  // ----- MP (NEW)
  getMP() { return _state.mp ?? 100; },
  setMP(value) {
    _state.mp = clamp(value, 0, _state.maxMp ?? 100);
    persist(); redraw();
    return _state.mp;
  },
  changeMP(delta) { return this.setMP((_state.mp ?? 100) + delta); },
  getMaxMP() { return _state.maxMp ?? 100; },

  // ----- stamina
  getStamina() { return _state.stamina; },
  getMaxStamina() { return _state.maxStamina ?? 100; }, // NEW explicit getter
  changeStamina(delta) {
    _state.stamina = clamp(_state.stamina + delta, 0, _state.maxStamina);
    persist(); redraw();
    return _state.stamina;
  },
  fullRest() {
    _state.stats.hp = _state.stats.maxHp;
    _state.stamina = _state.maxStamina;
    _state.mp = _state.maxMp;                 // also refill MP on full rest
    persist(); redraw();
  },
  useFieldRation(amount = 20) {
    if ((_state.restItems || 0) <= 0) return false;
    _state.restItems -= 1;
    _state.stamina = clamp(_state.stamina + amount, 0, _state.maxStamina);
    _state.stats.hp = clamp(_state.stats.hp + Math.round(_state.stats.maxHp * 0.2), 0, _state.stats.maxHp);
    persist(); redraw();
    return true;
  },

  // ----- inventory
  getInventory() { return Array.isArray(_state.inventory) ? [..._state.inventory] : []; },
  addInventory(itemId, count = 1) {
    if (!Array.isArray(_state.inventory)) _state.inventory = [];
    for (let i = 0; i < count; i++) _state.inventory.push(itemId);
    persist(); redraw();
  },

  // ----- ambush tracking
  pushAmbushResult(happened) {
    _state.lastAmbushes.push(!!happened);
    while (_state.lastAmbushes.length > 5) _state.lastAmbushes.shift();
    persist(); redraw();
  },
  getLastAmbushes() { return [..._state.lastAmbushes]; },

  // ----- town fallback
  setLastTownTile(x, y) { _state.lastTownTile = { x, y }; persist(); },
  getLastTownTile() { return _state.lastTownTile ? { ..._state.lastTownTile } : null; },

  // ----- identity
  getPlayerId() { return _state.playerId; },
  setPlayerId(id) { _state.playerId = String(id || "localDevPlayer"); persist(); }
};

// ----------------------------- Named Shim Exports -----------------------------
// Keep these stable to avoid churn in combatEngine/combatOverlay/etc.

// Snapshot for HUD/combat
export function getPlayer() {
  return {
    hp: _state.stats.hp,
    maxHp: _state.stats.maxHp,
    mp: _state.mp ?? 100,           // NEW
    maxMp: _state.maxMp ?? 100,     // NEW
    inventory: Array.isArray(_state.inventory) ? [..._state.inventory] : [],
    position: { ..._state.position }
  };
}

// Damage/heal by delta (negative = damage, positive = heal)
export function damagePlayer(delta = 0) {
  const next = clamp(_state.stats.hp + delta, 0, _state.stats.maxHp);
  _state.stats.hp = next;
  persist(); redraw();
  return _state.stats.hp;
}

// Required by combatOverlay (and others)
export function healToFull() { return playerState.healFull(); }
export const healFull = healToFull; // back-compat alias

// Loot injection (array of itemId strings)
export function addLoot(lootItems = []) {
  if (!Array.isArray(_state.inventory)) _state.inventory = [];
  for (const item of lootItems) _state.inventory.push(item);
  persist(); redraw();
  return [..._state.inventory];
}

// Convenience getters/setters some systems import directly
export function getPlayerPosition() { return playerState.getPosition(); }
export function setPlayerPosition(x, y) { playerState.setPosition(x, y); }
export function setPositionAndSave(x, y) { playerState.setPosition(x, y); }
export function getHP() { return playerState.getHP(); }
export function setHP(v) { return playerState.setHP(v); }
export function getStamina() { return playerState.getStamina(); }
export function getMaxStamina() { return playerState.getMaxStamina(); } // NEW explicit export
export function changeStamina(delta) { return playerState.changeStamina(delta); }
export function pushAmbushResult(h) { return playerState.pushAmbushResult(h); }
export function getLastAmbushes() { return playerState.getLastAmbushes(); }
export function setLastTownTile(x, y) { return playerState.setLastTownTile(x, y); }
export function getLastTownTile() { return playerState.getLastTownTile(); }
export function fullRest() { return playerState.fullRest(); }
export function useFieldRation(amount = 20) { return playerState.useFieldRation(amount); }
export function addInventory(itemId, count = 1) { return playerState.addInventory(itemId, count); }
export function getInventory() { return playerState.getInventory(); }
export function getPlayerId() { return playerState.getPlayerId(); }
export function setPlayerId(id) { return playerState.setPlayerId(id); }

// MP explicit exports for HUD/abilities
export function getMP() { return playerState.getMP(); }
export function setMP(v) { return playerState.setMP(v); }
export function changeMP(delta) { return playerState.changeMP(delta); }
export function getMaxMP() { return playerState.getMaxMP(); }

// Allow other modules to register a UI redraw hook
export function setRedraw(fn) { playerState.setRedraw(fn); }

// ------------------------------- Debug helpers --------------------------------
// Expose a hard reset for dev mode (not used in production)
export function __devResetPlayerState() {
  _state = { ...DEFAULT_STATE };
  persist(); redraw();
  return getPlayer();
}
