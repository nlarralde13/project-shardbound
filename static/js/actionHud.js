// static/js/actionHud.js (HUD-driven only; no keyboard movement)
// Emits: "game:log" (events[]), "game:moved" ({x,y})

import { API } from "/static/js/api.js";

let els = {};
let busy = false;

const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export function initActionHUD({ mount = ".room-stage" } = {}) {
  const host = typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!host) {
    console.warn("[actionHud] mount not found:", mount);
    return;
  }

  // Build overlay once
  const overlay = document.createElement("div");
  overlay.className = "action-overlay";
  overlay.innerHTML = `
    <div class="console-actions">
      <div class="group">
        <span class="label">Exits</span>
        <div class="btns">
          <button class="btn" data-move="N">N</button>
          <button class="btn" data-move="E">E</button>
          <button class="btn" data-move="S">S</button>
          <button class="btn" data-move="W">W</button>
        </div>
      </div>
      <div class="group">
        <span class="label">Actions</span>
        <div class="btns">
          <button id="act-search"  class="btn">Search</button>
          <button id="act-gather"  class="btn">Gather</button>
          <button id="act-attack"  class="btn">Attack</button>
          <button id="act-rest"    class="btn">Rest</button>
          <button id="act-enter"   class="btn">Enter</button>
          <span id="act-status" class="muted"></span>
        </div>
      </div>
    </div>
  `;
  host.appendChild(overlay);

  els = {
    root: overlay,
    status: overlay.querySelector("#act-status"),
    search: overlay.querySelector("#act-search"),
    gather: overlay.querySelector("#act-gather"),
    attack: overlay.querySelector("#act-attack"),
    rest:   overlay.querySelector("#act-rest"),
    enter:  overlay.querySelector("#act-enter"),
  };

  // Movement (clicks only)
  overlay.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-move]");
    if (!b || busy) return;
    const dir = b.getAttribute("data-move");
    await doMove(dir);
  });

  // Core verbs
  els.search.addEventListener("click", async () => doAction("search"));
  els.gather.addEventListener("click", async () => {
    const st = await API.state();
    const first = st?.interactions?.gather_nodes?.[0];
    if (!first) return toast("Nothing to gather here.");
    await doAction("gather", { node_id: first });
  });
  els.attack.addEventListener("click", async () => {
    const st = await API.state();
    const first = st?.interactions?.enemies?.[0];
    if (!first) return toast("No enemies in this room.");
    await doAction("attack", { target_id: first });
  });

  // Local verbs
  els.rest.addEventListener("click", async () => {
    toast("Resting…");
    window.dispatchEvent(new CustomEvent("game:log", { detail: [{ type: "log", text: "You rest. (+2 HP, +2 STA)"}] }));
    setTimeout(() => (els.status.textContent = ""), 800);
  });

  els.enter.addEventListener("click", async () => {
    try {
      setBusy(true);
      const out = await API.interact();
      if (out?.log) window.dispatchEvent(new CustomEvent("game:log", { detail: out.log.map(t => ({ text: t })) }));
    } finally {
      setBusy(false);
      const st = await API.state();
      updateActionHUD({ interactions: st.interactions });
    }
  });
}

export function updateActionHUD({ interactions }) {
  if (!interactions) return;
  toggle(els.search,  interactions.can_search);
  toggle(els.gather,  interactions.can_gather);
  toggle(els.attack,  interactions.can_attack);
}

export function setBusy(v) {
  busy = !!v;
  for (const b of [els.search, els.gather, els.attack]) {
    if (b) b.disabled = busy || b.dataset.disabled === "1";
  }
  if (els.status) els.status.textContent = busy ? "…" : "";
}

// ---- internals --------------------------------------------------------------
function toggle(btn, enabled) {
  if (!btn) return;
  btn.disabled = !enabled || busy;
  btn.dataset.disabled = enabled ? "0" : "1";
}

async function doMove(dir) {
  const delta = DIRS[dir];
  if (!delta) return;
  try {
    setBusy(true);
    const res = await API.move(delta[0], delta[1]);
    if (res?.log) window.dispatchEvent(new CustomEvent("game:log", { detail: res.log.map(t => ({ text: t })) }));
    if (res?.room_delta) window.patchRoom?.(res.room_delta);
    if (res?.room) window.patchRoom?.({ ...res.room });
    const pos = res?.player?.pos || [];
    if (pos.length === 2) window.dispatchEvent(new CustomEvent("game:moved", { detail: { x: pos[0], y: pos[1] } }));
    if (res?.interactions) updateActionHUD({ interactions: res.interactions });
  } catch (e) {
    console.error(e);
  } finally {
    setBusy(false);
  }
}

async function doAction(verb, payload = {}) {
  try {
    setBusy(true);
    const out = await API.action(verb, payload);
    if (out?.events?.length) window.dispatchEvent(new CustomEvent("game:log", { detail: out.events }));
    if (out?.room_delta) window.patchRoom?.(out.room_delta);
  } catch (err) {
    toast(`Action failed: ${verb}`);
    console.error(err);
  } finally {
    setBusy(false);
    const st = await API.state();
    updateActionHUD({ interactions: st.interactions });
  }
}

function toast(msg) {
  if (els.status) els.status.textContent = msg;
  setTimeout(() => (els.status.textContent = ""), 1200);
}
