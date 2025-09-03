// static/js/actionHud.js (HUD-driven only; no keyboard movement)
// Emits: "game:log" (events[]), "game:moved" ({x,y})

import { API } from "/static/js/api.js";
import { findShardgateAt, getRoomShard } from "/static/js/roomLoader.js";
import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

let els = {};
let busy = false;
let socket;
let currentInteractions = {};

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
    <div class="action-controls">
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
          <button id="act-talk"    class="btn">Talk</button>
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
    talk:   overlay.querySelector("#act-talk"),
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
    const first = currentInteractions?.gather_nodes?.[0];
    if (!first) return toast("Nothing to gather here.");
    await doAction("gather", { node_id: first });
  });
  els.attack.addEventListener("click", async () => {
    const first = currentInteractions?.enemies?.[0];
    if (!first) return toast("No enemies in this room.");
    await doAction("attack", { target_id: first });
  });
  els.talk.addEventListener("click", async () => {
    const first = currentInteractions?.npcs?.[0];
    if (!first) return toast("No one to talk to.");
    await doAction("talk", { target_id: first });
  });

  // Local verbs
  els.rest.addEventListener("click", async () => {
    toast("Resting…");
    window.dispatchEvent(new CustomEvent("game:log", { detail: [{ type: "log", text: "You rest. (+2 HP, +2 STA)", ts: Date.now() }] }));
    setTimeout(() => (els.status.textContent = ""), 800);
  });

  els.enter.addEventListener("click", async () => {
    try {
      setBusy(true);
      // Prefer shardgate action when available; fallback to generic interact
      if (currentInteractions?.can_enter_shardgate) {
        const res = await fetch('/api/console/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line: 'enter shardgate' })
        });
        const json = await res.json().catch(() => null);
        const frames = Array.isArray(json?.frames) ? json.frames : [];
        for (const f of frames) {
          if (f.type === 'text') {
            window.dispatchEvent(new CustomEvent('game:log', { detail: [{ text: f.data, ts: Date.now() }] }));
          } else if (f.type === 'event' && f.data?.name) {
            window.dispatchEvent(new CustomEvent(f.data.name, { detail: f.data.payload || {} }));
          }
        }
      } else {
        const out = await API.interact();
        if (out?.poi) window.dispatchEvent(new CustomEvent("game:poi", { detail: out.poi }));
        if (out?.log) window.dispatchEvent(new CustomEvent("game:log", { detail: out.log.map(t => ({ text: t, ts: Date.now() })) }));
      }
    } finally {
      setBusy(false);
    }
  });

  socket = io();
  socket.on("movement", (d) => {
    if (d?.log) window.dispatchEvent(new CustomEvent("game:log", { detail: d.log.map(t => ({ text: t, ts: Date.now() })) }));
    if (d?.room_delta) window.patchRoom?.(d.room_delta);
    if (d?.interactions) updateActionHUD({ interactions: d.interactions });
  });
  socket.on("combat", (d) => {
    if (d?.events) window.dispatchEvent(new CustomEvent("game:log", { detail: d.events.map(e => ({ ...e, ts: e.ts || Date.now() })) }));
    if (d?.room_delta) window.patchRoom?.(d.room_delta);
    if (d?.interactions) updateActionHUD({ interactions: d.interactions });
  });
  socket.on("resource_update", (d) => {
    if (d?.events) window.dispatchEvent(new CustomEvent("game:log", { detail: d.events.map(e => ({ ...e, ts: e.ts || Date.now() })) }));
    if (d?.room_delta) window.patchRoom?.(d.room_delta);
    if (d?.interactions) updateActionHUD({ interactions: d.interactions });
  });
}

export function updateActionHUD({ interactions }) {
  if (!interactions) return;
  const next = { ...currentInteractions, ...interactions };
  currentInteractions = next;
  toggle(els.search,  !!next.can_search);
  toggle(els.gather,  !!next.can_gather);
  toggle(els.attack,  !!next.can_attack);
  toggle(els.talk,    !!next.can_talk);
  // Optional: enter shardgate action
  const canEnterGate = !!next.can_enter_shardgate;
  if (els.enter) {
    els.enter.textContent = canEnterGate ? "Enter Shardgate" : "Enter";
    toggle(els.enter, canEnterGate);
  }
}

export function setBusy(v) {
  busy = !!v;
  for (const b of [els.search, els.gather, els.attack, els.talk]) {
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
    let res;
    if (window.__gameMode === 'town' && typeof window.townMove === 'function') {
      res = await window.townMove(delta[0], delta[1]);
    } else {
      res = await API.move(delta[0], delta[1]);
      if (res?.log) window.dispatchEvent(new CustomEvent("game:log", { detail: res.log.map(t => ({ text: t, ts: Date.now() })) }));
      if (res?.room_delta) window.patchRoom?.(res.room_delta);
      if (res?.room) window.patchRoom?.({ ...res.room });
      const pos = res?.player?.pos || [];
      if (pos.length === 2) window.dispatchEvent(new CustomEvent("game:moved", { detail: { x: pos[0], y: pos[1] } }));
    }
    if (res?.interactions) updateActionHUD({ interactions: res.interactions });
  } catch (e) {
    console.error(e);
  } finally {
    setBusy(false);
  }
}

async function doAction(verb, payload = {}) {
  let out;
  try {
    setBusy(true);
    out = await API.action(verb, payload);
    if (out?.events?.length) window.dispatchEvent(new CustomEvent("game:log", { detail: out.events.map(e => ({ ...e, ts: e.ts || Date.now() })) }));
    if (out?.room_delta) window.patchRoom?.(out.room_delta);
    if (out?.interactions) updateActionHUD({ interactions: out.interactions });
  } catch (err) {
    toast(`Action failed: ${verb}`);
    console.error(err);
  } finally {
    setBusy(false);


    if (out?.interactions) updateActionHUD({ interactions: out.interactions });

  }
}

function toast(msg) {
  if (els.status) els.status.textContent = msg;
  setTimeout(() => (els.status.textContent = ""), 1200);
}

// ---- Local Search (client-side discovery) -----------------------------------
async function doLocalSearch() {
  try {
    setBusy(true);
    const shard = window.__lastShard || getRoomShard();
    const pos = { x: window.currentRoom?.x|0, y: window.currentRoom?.y|0 };
    let events = [];
    let interactions = { ...currentInteractions };
    const gate = findShardgateAt(shard, pos.x, pos.y);
    if (gate) {
      events.push({ type: 'log', text: 'There is a Shardgate here.' });
      interactions.can_enter_shardgate = true;
    }
    if (events.length) window.dispatchEvent(new CustomEvent('game:log', { detail: events.map(e => ({ ...e, ts: Date.now() })) }));
    if (interactions) updateActionHUD({ interactions });
  } catch (e) {
    console.error(e);
  } finally {
    setBusy(false);
  }
}
