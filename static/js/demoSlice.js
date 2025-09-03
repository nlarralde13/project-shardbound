import { ModeManager } from './ui/modeManager.js';
import { renderTown } from './town/townRenderer.js';
import { renderCombat } from './combat/combatUI.js';
import * as GameAPI from './net/gameApi.js';

const mode = new ModeManager();
const container = document.getElementById('roomArt');
let charId = null;
let rooms = [];
let questRoom = null;
let playerRoom = null;
let encounter = null;

window.__gameMode = 'overworld';

window.addEventListener('game:poi', async (e) => {
  if (!charId) return;
  const poi = e.detail;
  if (mode.getMode() === 'overworld' && poi && (poi.type === 'town' || poi.type === 'village')) {
    const r = await GameAPI.enterTown(charId);
    rooms = r.rooms || [];
    questRoom = r.quest_giver_room;
    playerRoom = r.player_room;
    mode.setMode('town');
    window.__gameMode = 'town';
    container && renderTown(container, rooms, playerRoom);
  }
});

window.townMove = async (dx, dy) => {
  if (!charId) return {};
  const r = await GameAPI.townMove(charId, { dx, dy });
  if (r?.room) {
    playerRoom = { x: r.room.room_x, y: r.room.room_y };
  } else {
    playerRoom = { x: (playerRoom?.x || 0) + dx, y: (playerRoom?.y || 0) + dy };
  }
  container && renderTown(container, rooms, playerRoom);
  return r;
};


function drawCombat() {
  if (!container) return;
  if (!encounter) { container.innerHTML = ''; return; }
  renderCombat(container, encounter, async () => {
    encounter = await GameAPI.encounterTurn({ action: 'attack', target: 'goblin1' });
    drawCombat();
  });
  if (encounter.finished) {
    const win = encounter.hp.player > 0;
    console.log(win ? 'Victory!' : 'Defeated...');
    mode.setMode('overworld');
    encounter = null;
  }
}

function boot() {
  charId = window.__activeCharacter?.character_id;
  if (!charId) return;
  console.log('Demo ready. Commands: move n|s|e|w, enter, leave, room x y, talk <npc>, attack');
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

