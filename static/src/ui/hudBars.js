// Lightweight HUD for HP / MP / Stamina pinned inside shard container.
import {
  setRedraw,     // subscribe to any state change
  getPlayer,     // snapshot: { hp, maxHp, mp, maxMp, position, inventory }
  getStamina, getMaxStamina,
  getMP, getMaxMP
} from "../state/playerState.js";

let els = { root: null, hpFill: null, mpFill: null, staFill: null, hpLbl: null, mpLbl: null, staLbl: null };

function pct(val, max) {
  const v = Number.isFinite(val) ? val : 0;
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const p = Math.max(0, Math.min(100, Math.round((v / m) * 100)));
  return `${p}%`;
}

/**
 * Mount inside the same container you pass to initShardRenderer({ container })
 * Example:
 *   const view = initShardRenderer({ container: mapDiv, ... });
 *   initHUDBars(mapDiv);  // pins bars in top-left of the map
 */
export function initHUDBars(containerEl, id = "hudBars") {
  if (!containerEl) throw new Error("initHUDBars: containerEl is required");

  let root = containerEl.querySelector(`#${id}`);
  if (!root) {
    root = document.createElement("div");
    root.id = id;
    containerEl.appendChild(root);
  }

  root.innerHTML = `
    <div class="hud-row"><div class="hud-fill hud-hp"></div><div class="hud-label"></div></div>
    <div class="hud-row"><div class="hud-fill hud-mp"></div><div class="hud-label"></div></div>
    <div class="hud-row"><div class="hud-fill hud-sta"></div><div class="hud-label"></div></div>
  `;

  const [hpRow, mpRow, staRow] = root.querySelectorAll(".hud-row");
  els = {
    root,
    hpFill:  hpRow.querySelector(".hud-fill"),
    mpFill:  mpRow.querySelector(".hud-fill"),
    staFill: staRow.querySelector(".hud-fill"),
    hpLbl:   hpRow.querySelector(".hud-label"),
    mpLbl:   mpRow.querySelector(".hud-label"),
    staLbl:  staRow.querySelector(".hud-label"),
  };

  // Initial paint + subscribe to ALL player state changes
  updateHUDBars();
  setRedraw(() => updateHUDBars());
}

export function updateHUDBars() {
  // Pull from canonical state (these update whenever you move, rest, take damage, etc.)
  const snap   = getPlayer();           // hp/maxHp/mp/maxMp from playerState
  const hp     = snap.hp ?? 100;
  const maxHp  = snap.maxHp ?? 100;
  const mp     = getMP?.() ?? snap.mp ?? 100;
  const maxMp  = getMaxMP?.() ?? snap.maxMp ?? 100;
  const stam   = getStamina?.() ?? 100;
  const maxSta = getMaxStamina?.() ?? 100;

  els.hpFill.style.width  = pct(hp, maxHp);
  els.mpFill.style.width  = pct(mp, maxMp);
  els.staFill.style.width = pct(stam, maxSta);

  els.hpLbl.textContent  = `HP ${hp}/${maxHp}`;
  els.mpLbl.textContent  = `MP ${mp}/${maxMp}`;
  els.staLbl.textContent = `Stamina ${stam}/${maxSta}`;
}
