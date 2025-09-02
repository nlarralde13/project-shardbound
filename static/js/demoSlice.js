import { setupConsole } from './ui/console.js';
import { ModeManager } from './ui/modeManager.js';
import { renderTown } from './town/townRenderer.js';
import { renderCombat } from './combat/combatUI.js';
import * as GameAPI from './net/gameApi.js';

const mode = new ModeManager();
const container = document.getElementById('roomArt');
let charId = null;
let rooms = [];
let questRoom = null;
let encounter = null;

function log(msg) {
  const logEl = document.getElementById('console');
  if (logEl) {
    const d = document.createElement('div');
    d.textContent = msg;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  } else {
    console.log(msg);
  }
}

async function handleCommand(text) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0];
  if (!cmd) return;
  if (!charId) { log('No character.'); return; }

  if (mode.getMode() === 'overworld') {
    if (cmd === 'move') {
      const dir = parts[1];
      const map = { n:[0,-1], s:[0,1], e:[1,0], w:[-1,0] };
      const d = map[dir];
      if (!d) { log('Bad direction.'); return; }
      const r = await GameAPI.move(charId, { dx:d[0], dy:d[1] });
      log(`Moved to (${r.x},${r.y})`);
      if (r.canEnterTown) log('Enter town available (type "enter").');
      if (r.encounter) {
        encounter = await GameAPI.encounterStart({ script_id: r.encounter.script_id });
        mode.setMode('combat');
        drawCombat();
      }
    } else if (cmd === 'enter') {
      const r = await GameAPI.enterTown(charId);
      rooms = r.rooms || [];
      questRoom = r.quest_giver_room;
      mode.setMode('town');
      container && renderTown(container, rooms, r.player_room);
    }
  } else if (mode.getMode() === 'town') {
    if (cmd === 'leave') {
      await GameAPI.leaveTown(charId);
      mode.setMode('overworld');
      container && (container.innerHTML = '');
      log('Left town.');
    } else if (cmd === 'room') {
      const x = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (Number.isNaN(x) || Number.isNaN(y)) { log('Usage: room x y'); return; }
      await GameAPI.townMove(charId, { room_x: x, room_y: y });
      container && renderTown(container, rooms, { x, y });
      if (questRoom && x === questRoom.x && y === questRoom.y) {
        log('a shady figure appears in the corner');
      }
    } else if (cmd === 'talk') {
      const npc = parts[1];
      const res = await GameAPI.talk(charId, { npc_id: npc });
      if (res && res.message) log(res.message);
    }
  } else if (mode.getMode() === 'combat') {
    if (cmd === 'attack') {
      encounter = await GameAPI.encounterTurn({ action: 'attack', target: 'goblin1' });
      drawCombat();
    }
  }
}

function drawCombat() {
  if (!container) return;
  if (!encounter) { container.innerHTML = ''; return; }
  renderCombat(container, encounter, async () => {
    encounter = await GameAPI.encounterTurn({ action: 'attack', target: 'goblin1' });
    drawCombat();
  });
  if (encounter.finished) {
    const win = encounter.hp.player > 0;
    log(win ? 'Victory!' : 'Defeated...');
    mode.setMode('overworld');
    encounter = null;
  }
}

function boot() {
  charId = window.__activeCharacter?.character_id;
  if (!charId) return;
  setupConsole(handleCommand);
  log('Demo ready. Commands: move n|s|e|w, enter, leave, room x y, talk <npc>, attack');
}

if (window.__activeCharacter) {
  boot();
} else {
  window.addEventListener('load', () => {
    const iv = setInterval(() => {
      if (window.__activeCharacter) { clearInterval(iv); boot(); }
    }, 200);
  });
}

