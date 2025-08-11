// data/classTemplates.js
// Class templates → starting stats/skills/items. Numbers are placeholder.

export const classTemplates = {
  fighter: {
    name: 'Fighter',
    stats: { hp: 140, mp: 20,  sp: 100 },
    skills: ['slash','shield_up','charge','rally'],
    perks: ['break_doors','intimidate'],
    items: ['iron_sword','buckler'],
  },
  mage: {
    name: 'Mage',
    stats: { hp: 90,  mp: 140, sp: 50  },
    skills: ['fireball','frost_bolt','flame_ward','meteor'],
    perks: [],
    items: ['oak_staff'],
  },
  paladin: {
    name: 'Paladin',
    stats: { hp: 120, mp: 100, sp: 70  },
    skills: ['smite','aegis','lay_on_hands','bless'],
    perks: ['holy_sight'],
    items: ['warhammer','kite_shield'],
  },
  cleric: {
    name: 'Cleric',
    stats: { hp: 110, mp: 120, sp: 60  },
    skills: ['heal','bless','ward','turn_undead'],
    perks: ['sanctify'],
    items: ['mace','reliquary'],
  },
  rogue: {
    name: 'Rogue',
    stats: { hp: 100, mp: 40,  sp: 120 },
    skills: ['backstab','smoke_bomb','mark_target','track'],
    perks: ['lockpick'],
    items: ['dagger','cloak'],
  },
  druid: {
    name: 'Druid',
    stats: { hp: 100, mp: 120, sp: 60  },
    skills: ['entangle','rejuvenate','wildshape','forage'],
    perks: ['speak_with_animals'],
    items: ['sickle'],
  },
  ranger: {
    name: 'Ranger',
    stats: { hp: 110, mp: 50,  sp: 110 },
    skills: ['aimed_shot','multi_shot','pet_command','trap','track','forage'],
    perks: ['beast_lore'],
    items: ['longbow','snare'],
  },
};
