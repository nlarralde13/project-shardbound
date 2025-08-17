// Tiny, deterministic-enough mock combat for MVP1.
// One enemy at a time; supports a room with N mobs by queueing them.
import { getPlayer, damagePlayer, addLoot } from "../state/playerState.js";

function roll(p) { return Math.random() < p; } // simple for mock

// Convert a mob id to a simple stat block
function mobFromId(id) {
  const map = {
    sea_slime:   { name: 'Sea Slime',   hp: 6,  atk: 2, loot: ['gel'] },
    pirate_scout:{ name: 'Pirate Scout',hp: 10, atk: 3, loot: ['coin'] },
    wild_boar:   { name: 'Wild Boar',   hp: 8,  atk: 3, loot: ['hide'] },
    jungle_bandit:{name:'Jungle Bandit',hp: 10, atk: 4, loot: ['dagger'] },
    sand_imp:    { name: 'Sand Imp',    hp: 7,  atk: 3, loot: ['sand_shard'] },
    bandit:      { name: 'Bandit',      hp: 10, atk: 4, loot: ['coin'] },
    ash_imp:     { name: 'Ash Imp',     hp: 8,  atk: 4, loot: ['ember'] },
    lava_sprite: { name: 'Lava Sprite', hp: 12, atk: 5, loot: ['obsidian_chip'] },
  };
  return { ...(map[id] ?? { name: id, hp: 8, atk: 3, loot: [] }) };
}

export function simulateCombat(roomMobs) {
  // Returns a transcript + result; does NOT mutate room state or player inventory.
  const transcript = [];
  const player = { ...getPlayer() }; // copy
  const remainingLoot = [];

  const queue = roomMobs.map(m => mobFromId(m.id));
  if (queue.length === 0) {
    return { result: 'no_enemy', transcript: ['No enemies present.'], loot: [] };
  }

  while (queue.length && player.hp > 0) {
    const enemy = queue[0];

    // Player turn
    const crit = roll(0.1);
    const dmg = (crit ? 2 : 1) * 5; // 5 base, double on crit
    enemy.hp = Math.max(0, enemy.hp - dmg);
    transcript.push(`You hit ${enemy.name} for ${dmg}${crit ? ' (CRIT)' : ''}. (${enemy.hp} HP left)`);

    if (enemy.hp <= 0) {
      transcript.push(`${enemy.name} defeated!`);
      remainingLoot.push(...enemy.loot);
      queue.shift();
      if (!queue.length) break; // room cleared
    }

    // Enemy turn (only if it survived)
    if (enemy.hp > 0) {
      const edmg = enemy.atk;
      player.hp = Math.max(0, player.hp - edmg);
      transcript.push(`${enemy.name} hits you for ${edmg}. (${player.hp} HP left)`);
    }
  }

  const result = player.hp > 0 ? 'victory' : 'defeat';
  return { result, transcript, loot: result === 'victory' ? remainingLoot : [] };
}

export function applyCombatResults({ result, loot }) {
  if (result === 'victory' && loot.length) addLoot(loot);
  if (result === 'defeat') damagePlayer(0); // state save; your UI should suggest resting/heal
}
