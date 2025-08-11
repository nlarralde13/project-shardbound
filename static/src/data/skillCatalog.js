// data/skillCatalog.js
// Canonical skill definitions (names, icons, simple costs/cooldowns).
// Keep minimal for now; we’ll expand effects later.

export const skillCatalog = {
  // universal/world
  explore:      { name: 'Explore', icon: '🧭', type: 'world' },

  // fighter
  slash:        { name: 'Slash', icon: '🗡️', cost: { sp: 10 }, cd: 2, tags: ['melee'] },
  shield_up:    { name: 'Shield Up', icon: '🛡️', cost: { sp: 8 }, cd: 3, tags: ['defense'] },
  charge:       { name: 'Charge', icon: '🏃', cost: { sp: 12 }, cd: 4, tags: ['gapcloser'] },
  rally:        { name: 'Rally', icon: '📣', cost: { sp: 10 }, cd: 5, tags: ['party-buff'] },

  // mage (elementalist + control)
  fireball:     { name: 'Fireball', icon: '🔥', cost: { mp: 15 }, cd: 3, tags: ['ranged','aoe'] },
  frost_bolt:   { name: 'Frost Bolt', icon: '❄️', cost: { mp: 10 }, cd: 2, tags: ['slow'] },
  flame_ward:   { name: 'Flame Ward', icon: '🛡️', cost: { mp: 12 }, cd: 5, tags: ['ward'] },
  meteor:       { name: 'Meteor', icon: '☄️', cost: { mp: 35 }, cd: 10, tags: ['ultimate'] },

  // paladin
  smite:        { name: 'Smite', icon: '⚔️', cost: { mp: 10 }, cd: 2, tags: ['holy'] },
  aegis:        { name: 'Aegis', icon: '🛡️', cost: { mp: 12 }, cd: 5, tags: ['ward'] },
  lay_on_hands: { name: 'Lay on Hands', icon: '🤲', cost: { mp: 30 }, cd: 12, tags: ['big-heal'] },
  bless:        { name: 'Bless', icon: '✨', cost: { mp: 10 }, cd: 4, tags: ['buff'] },

  // cleric
  heal:         { name: 'Heal', icon: '➕', cost: { mp: 12 }, cd: 2, tags: ['heal'] },
  ward:         { name: 'Ward', icon: '🛡️', cost: { mp: 10 }, cd: 4, tags: ['defense'] },
  turn_undead:  { name: 'Turn Undead', icon: '🕯️', cost: { mp: 18 }, cd: 8, tags: ['control'] },

  // rogue
  backstab:     { name: 'Backstab', icon: '🗡️', cost: { sp: 12 }, cd: 3, tags: ['stealth'] },
  smoke_bomb:   { name: 'Smoke', icon: '💨', cost: { sp: 10 }, cd: 6, tags: ['evade'] },
  mark_target:  { name: 'Mark', icon: '🎯', cost: { sp: 6 }, cd: 2, tags: ['debuff'] },
  track:        { name: 'Track', icon: '👣', type: 'world', cd: 5, tags: ['scout'] },

  // druid
  entangle:     { name: 'Entangle', icon: '🌿', cost: { mp: 10 }, cd: 3, tags: ['root'] },
  rejuvenate:   { name: 'Rejuvenate', icon: '💚', cost: { mp: 14 }, cd: 3, tags: ['hot'] },
  wildshape:    { name: 'Wildshape', icon: '🐾', cost: { mp: 20 }, cd: 10, tags: ['transform'] },
  forage:       { name: 'Forage', icon: '🍄', type: 'world', cd: 5, tags: ['gather'] },

  // ranger
  aimed_shot:   { name: 'Aimed Shot', icon: '🏹', cost: { sp: 10 }, cd: 2, tags: ['ranged'] },
  multi_shot:   { name: 'Multi-shot', icon: '🎯', cost: { sp: 16 }, cd: 4, tags: ['cleave'] },
  pet_command:  { name: 'Pet Command', icon: '🐺', cost: { sp: 8 }, cd: 3, tags: ['pet'] },
  trap:         { name: 'Trap', icon: '🪤', cost: { sp: 12 }, cd: 6, tags: ['control'] },
};
