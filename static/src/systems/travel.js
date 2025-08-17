import { TravelConfig } from "../config/travelConfig.js";
import { rngFrom } from "../utils/rng.js";
import {
  loadPlayerState, savePlayerState, getPlayerId,
  getPlayerPosition, setPlayerPosition,
  changeStamina, pushAmbushResult
} from "../state/playerState.js";
import { computeAmbushChance, startAmbush, nearestTownPort } from "./ambush.js";
import { generateMiniShard } from "../slices/generateMiniShard.js"; // assumed existing per MVP1
// ^ If your path differs, adjust import. This module only calls the entry-point.

const DIRS = {
  N: {dx:0, dy:-1}, S:{dx:0, dy:1}, E:{dx:1, dy:0}, W:{dx:-1, dy:0}
};

export function isSliceTile(tile){
  return tile && TravelConfig.SLICE_TILETYPES.has(tile.tileType);
}

export async function moveCardinal(direction, { world, shardId, combatEngine, timeWeather={night:false,storm:false}, render }) {
  const d = DIRS[direction]; if (!d) return { ok:false, reason:"BAD_DIR" };
  const pos = getPlayerPosition();
  const nx = pos.x + d.dx, ny = pos.y + d.dy;

  if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height)
    return { ok:false, reason:"OUT_OF_BOUNDS" };

  // Stamina check
  const sAfter = changeStamina(-TravelConfig.STAMINA.COST_TRAVEL);
  if (sAfter < 0) { changeStamina(+TravelConfig.STAMINA.COST_TRAVEL); return { ok:false, reason:"NO_STAMINA" }; }

  const tile = world.tiles[ny][nx];
  const biome = tile?.biome || "plains";

  // Ambush roll (seeded)
  const { P } = computeAmbushChance({
    world, spawn: world.spawn, pos: {x:nx, y:ny}, biome, timeWeather
  });
  const rng = rngFrom({
    worldSeed: world.worldSeed, shardId, tileX: nx, tileY: ny,
    playerId: getPlayerId(), systemTag: "AMBUSH"
  });
  const roll = rng.float();

  if (roll < P) {
    // Ambush triggers; do NOT update tile yet; combat decides final state.
    const outcome = await startAmbush({ world, shardId, tileX:nx, tileY:ny, biome, combatEngine });
    // After ambush (victory or defeat), we still consider the move resolved to the intended tile
    // unless defeat teleported the player. Check current position post-combat:
    const curr = getPlayerPosition();
    if (curr.x === pos.x && curr.y === pos.y) setPlayerPosition(nx, ny);
    pushAmbushResult(true);
  } else {
    setPlayerPosition(nx, ny);
    pushAmbushResult(false);
  }

  // Enter slice if tile requires
  if (isSliceTile(tile)) {
    await enterSliceForTile({ world, shardId, tile, tilePos: {x:nx,y:ny}, playerId: getPlayerId() });
  }

  if (typeof render === "function") render();
  return { ok:true, moved:true };
}

export async function enterSliceForTile({ world, shardId, tile, tilePos, playerId }) {
  // Deterministically generate the 4×4, pick entry/exit inside generateMiniShard
  await generateMiniShard({
    worldSeed: world.worldSeed,
    shardId,
    tileX: tilePos.x,
    tileY: tilePos.y,
    biome: tile.biome,
    tileType: tile.tileType,
    playerId,
    // Provide hooks your slice UI expects; adjust if your function signature differs
    options: { fogOfWar: true }
  });
}
