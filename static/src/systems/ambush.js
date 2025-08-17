import { TravelConfig } from "../config/travelConfig.js";
import { getMobPool } from "../data/encounterTables.js";
import { NON_RARE_SET, rollAmbushLoot } from "../data/lootTables.js";
import {
  loadPlayerState, savePlayerState, pushAmbushResult, addInventory,
  loseRandomNonRareStack, getPlayerId, healFull, setPositionAndSave
} from "../state/playerState.js";
import { rngFrom } from "../utils/rng.js";

// Helpers
const manhattan = (a,b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y);

export function nearestTownPort(world, fromTile){
  let best = null, bestD = Infinity;
  for (let y=0; y<world.height; y++){
    for (let x=0; x<world.width; x++){
      const t = world.tiles[y][x];
      if (!t) continue;
      if (TravelConfig.SLICE_TILETYPES.has(t.tileType) && (t.tileType==="town" || t.tileType==="port")){
        const d = manhattan({x,y}, fromTile);
        if (d < bestD){ bestD = d; best = {x,y}; }
      }
    }
  }
  return { pos: best, dist: bestD };
}

function depthNorm(world, spawn, pos){
  const num = manhattan(spawn, pos);
  const denom = (world.width-1) + (world.height-1) || 1;
  return Math.max(0, Math.min(1, num / denom));
}

function safetyDelta(dist){
  if (dist <= 1) return TravelConfig.SAFETY.dist1;
  if (dist === 2) return TravelConfig.SAFETY.dist2;
  if (dist === 3) return TravelConfig.SAFETY.dist3;
  return 0;
}

function biomeProbDelta(biome){
  return TravelConfig.BIOME_PROB_DELTA[biome] ?? 0;
}
function biomeDangerWeight(biome){
  return TravelConfig.BIOME_DANGER_WEIGHT[biome] ?? 0.05;
}

function streakDelta(lastAmbushes){
  const last = lastAmbushes[lastAmbushes.length-1] ?? false;
  const last3 = lastAmbushes.slice(-3);
  const noAmbush3 = last3.length === 3 && last3.every(v => !v);
  if (last) return TravelConfig.STREAK.AFTER_AMBUSH_REDUCTION;
  if (noAmbush3) return TravelConfig.STREAK.NO_AMBUSH_3_BONUS;
  return 0;
}

export function computeAmbushChance({ world, spawn, pos, biome, timeWeather={night:false, storm:false} }){
  const { pos: townPos, dist } = nearestTownPort(world, pos);
  const dNorm = depthNorm(world, spawn, pos);
  const dBiome = biomeProbDelta(biome);
  const dSafety = safetyDelta(dist ?? 99);
  const dDepth = Math.min(TravelConfig.DEPTH_MAX_BONUS, dNorm * TravelConfig.DEPTH_MAX_BONUS);
  const dTime = (timeWeather.night?TravelConfig.NIGHT_BONUS:0) + (timeWeather.storm?TravelConfig.STORM_BONUS:0);
  const dStreak = streakDelta(loadPlayerState().lastAmbushes);

  let P = TravelConfig.P_BASE + dBiome + dSafety + dDepth + dTime + dStreak;
  P = Math.max(TravelConfig.P_FLOOR, Math.min(TravelConfig.P_CEIL, P));
  return { P, meta: { distToTown: dist ?? null, dNorm, dBiome, dSafety, dDepth, dTime, dStreak, nearestTown: townPos } };
}

export function computeDangerLevel({ world, spawn, pos, biome, timeWeather={night:false, storm:false} }){
  const dNorm = depthNorm(world, spawn, pos);
  const score = (
    dNorm * 0.5 +
    biomeDangerWeight(biome) +
    ((timeWeather.night?0.03:0)+(timeWeather.storm?0.02:0)) +
    (loadPlayerState().stamina <= 0 ? 0.05 : 0)
  );
  const DL = Math.max(0, Math.min(5, Math.floor(score * 6)));
  return DL;
}

function pickAmbushGroupSize(DL, rng) {
  const [min,max] = TravelConfig.AMBUSH_GROUP_BY_DL[DL] || [1,1];
  return rng.int(min, max);
}

export function buildAmbushEnemies({ biome, DL, rng }){
  const pool = getMobPool(biome, DL);
  const size = pickAmbushGroupSize(DL, rng);
  const enemies = [];
  for (let i=0; i<size; i++){
    enemies.push(rng.pick(pool));
  }
  return enemies;
}

// Integrates with your combat overlay. Provide a simple contract.
// combatEngine.startCombat({ enemies, source:"AMBUSH", onVictory, onDefeat })
export async function startAmbush({ world, shardId, tileX, tileY, biome, combatEngine }) {
  const state = loadPlayerState();
  const DL = computeDangerLevel({ world, spawn: world.spawn, pos: {x:tileX,y:tileY}, biome });
  const rng = rngFrom({
    worldSeed: world.worldSeed, shardId, tileX, tileY, playerId: getPlayerId(), systemTag: "AMBUSH"
  });
  const enemies = buildAmbushEnemies({ biome, DL, rng });

  const result = await combatEngine.startCombat({
    enemies, source: "AMBUSH",
    onVictory: (summary)=>{}, // optional hook
    onDefeat: (summary)=>{},  // optional hook
  });

  if (result?.victory){
    // Loot per enemy
    for (let i=0;i<enemies.length;i++){
      const lootId = rollAmbushLoot(DL, biome, rng);
      addInventory(lootId, 1);
    }
    pushAmbushResult(true); // ambush happened (and won)
    return { type: "victory", DL, enemies };
  } else {
    // Defeat: teleport to nearest town, full heal, lose 1 non-rare stack
    const { pos: townPos } = nearestTownPort(world, {x:tileX, y:tileY});
    if (townPos){
      setPositionAndSave(townPos.x, townPos.y);
    } else if (world.spawn) {
      setPositionAndSave(world.spawn.x, world.spawn.y);
    }
    healFull();
    const lost = loseRandomNonRareStack(NON_RARE_SET);
    pushAmbushResult(true);
    return { type: "defeat", DL, enemies, lost };
  }
}
