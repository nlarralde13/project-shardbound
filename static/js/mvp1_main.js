// /static/js/mvp1_main.js
import { loadShard } from "../src/shards/shardLoader.js";
import { initShardRenderer } from "../src/ui/renderShard.js";
import { initHUDBars } from "../src/ui/hudBars.js";
import { attachTooltip } from "../src/ui/tooltip.js";
import { generateMiniShard } from "../src/slices/generateMiniShard.js";
import { openMiniShardOverlay } from "../src/ui/renderMiniShard.js";
import { loadImages } from "../src/utils/imageLoader.js";

import { TravelConfig } from "/static/src/config/travelConfig.js";
import {
  getStamina, getMaxStamina, changeStamina,
  getPlayerPosition, setPlayerPosition
} from "/static/src/state/playerState.js";

const viewport   = document.getElementById("viewportWrapper");
const mapHost    = document.getElementById("map");
const shardSelect= document.getElementById("shardSelect");
const gridToggle = document.getElementById("gridToggle");
const btnZoomIn  = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const btnExplore = document.getElementById("btnExplore");
const btnReload  = document.getElementById("btnReloadShard");
const logEl      = document.getElementById("console");

let shard = null;
let renderer = null;
let lastSelected = { x: -1, y: -1, biome: "ocean" };
let sprites = null;

const params = new URLSearchParams(location.search);
const DEV = params.get("devMode") === "1";
const GOD = DEV && params.get("god") === "1";

function log(msg, data) {
  const time = new Date().toLocaleTimeString();
  let line = `[${time}] ${msg}`;
  if (data !== undefined) {
    try { line += " " + JSON.stringify(data); } catch { line += " " + String(data); }
  }
  logEl.textContent += "\n" + line;
  logEl.scrollTop = logEl.scrollHeight;
}

// Prevent 0-stamina softlocks during iteration
function rescueStaminaOnBoot(){
  const cur = getStamina();
  if (GOD) {
    const delta = getMaxStamina() - cur;
    if (delta > 0) changeStamina(delta);
    log("[dev] god=1 → stamina refilled.");
    return;
  }
  if (cur <= 0) {
    const floor = 20;
    const delta = Math.max(0, floor - cur);
    if (delta > 0) {
      changeStamina(delta);
      log("You wake groggy. Stamina set to 20 so you can reach a town / test flows.");
    }
  }
}

async function bootShard(id) {
  shard = await loadShard(id);

  if (!sprites) {
    sprites = await loadImages({
      land: "/static/assets/2d/character.png",
      boat: "/static/assets/2d/boat.png",
    });
  }

  if (renderer) { renderer.destroy(); renderer = null; }

  const start = findStart(shard);
  const container = mapHost || viewport;

  initHUDBars(container);
  rescueStaminaOnBoot(); // <-- do this once HUD/state is in memory

  renderer = initShardRenderer({
    container,
    shardData: shard,
    overlay: { grid: gridToggle.checked },
    onTileClick: (tile) => {
      lastSelected = tile;
      renderer.setPlayer({ x: tile.x, y: tile.y });
      log(`Selected tile (${tile.x},${tile.y}) biome=${tile.biome}`);
    },
    player: { x: start.x, y: start.y, spriteLand: sprites.land, spriteWater: sprites.boat },
  });

  attachTooltip(container, renderer);
  log(`Shard ${id} loaded. Player at (${start.x},${start.y}).`);
}

function findStart(shard) {
  for (let y = 0; y < shard.tiles.length; y++) {
    for (let x = 0; x < shard.tiles[0].length; x++) {
      const c = shard.tiles[y][x];
      if (c.biome !== "ocean" && (
        (shard.tiles[y-1]?.[x]?.biome === "ocean") ||
        (shard.tiles[y+1]?.[x]?.biome === "ocean") ||
        (shard.tiles[y]?.[x-1]?.biome === "ocean") ||
        (shard.tiles[y]?.[x+1]?.biome === "ocean")
      )) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

// Stamina-aware move helper (kept for future B-only callers)
export function applyCardinalMove_B(world, dir) {
  const DIRS = { N:{dx:0,dy:-1}, S:{dx:0,dy:1}, E:{dx:1,dy:0}, W:{dx:-1,dy:0} };
  const d = DIRS[dir]; if (!d) return { ok:false, reason:"BAD_DIR" };

  const { x, y } = getPlayerPosition();
  const nx = x + d.dx, ny = y + d.dy;
  if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) {
    return { ok:false, reason:"OUT_OF_BOUNDS" };
  }

  const cost = TravelConfig.STAMINA?.COST_TRAVEL ?? 1;
  if (!GOD && getStamina() < cost) return { ok:false, reason:"NO_STAMINA" };

  if (!GOD) changeStamina(-cost);
  setPlayerPosition(nx, ny);
  return { ok:true };
}

// -------------------- UI wire-up --------------------
gridToggle.addEventListener("change", () => {
  if (!renderer) return;
  renderer.setOverlayFlags({ grid: gridToggle.checked });
  log(`Grid ${gridToggle.checked ? "on" : "off"}.`);
});

shardSelect.addEventListener("change", async () => { await bootShard(shardSelect.value); });

btnZoomIn.addEventListener("click", () => {
  if (!renderer) return;
  renderer.camera.zoomIn();
  renderer.updateShard(shard);
  log("Zoom in");
});

btnZoomOut.addEventListener("click", () => {
  if (!renderer) return;
  renderer.camera.zoomOut();
  renderer.updateShard(shard);
  log("Zoom out");
});

btnReload.addEventListener("click", async () => {
  await bootShard(shardSelect.value);
  log("Shard reloaded.");
});

btnExplore.addEventListener("click", async () => {
  if (!renderer) { log("Renderer not ready"); return; }
  // Guard: do not allow explore when exhausted (unless in dev god)
  const roomCost = TravelConfig.STAMINA?.COST_ROOM ?? 1;
  if (!GOD && getStamina() < roomCost) {
    log("Too exhausted to explore.");
    return;
  }

  const pos = renderer.getPlayer();
  const biome = shard.tiles[pos.y][pos.x]?.biome ?? "ocean";
  const mini = await generateMiniShard({
    shardId: shard.shardId,
    tileX: pos.x, tileY: pos.y,
    biome,
    worldSeed: shard.worldSeed
  });
  log("Generated mini-shard 4×4 at player:", { biome: mini.biome });
  openMiniShardOverlay({
    parent: document.body,
    slice:mini,
    shardId: shard.shardId,
    tileX: pos.x,
    tileY: pos.y,
    biome,
    worldSeed: shard.worldSeed,
  });
});

// Initial boot
bootShard(shardSelect.value || "A");
