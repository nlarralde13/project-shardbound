// Visual overlay for the combat transcript + actions.
import { simulateCombat, applyCombatResults } from "../combat/combatEngine.js";
import { getPlayer, healToFull } from "../state/playerState.js";

export function openCombatOverlay({ parent, mobs, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'miniOverlay';
  wrap.innerHTML = `
    <div class="miniPanel">
      <div class="miniHeader">
        <div class="title">Encounter — ${mobs.map(m=>m.id).join(', ')}</div>
        <div class="spacer"></div>
        <button class="btnClose">Exit</button>
      </div>
      <div class="combatPanel">
        <div class="combatStats">
          <div><b>Player:</b> <span id="pHP"></span> HP</div>
          <div class="muted">Tip: This is a mock demo. Outcome is simplified.</div>
        </div>
        <div id="combatLog" class="combatLog"></div>
        <div class="combatActions">
          <button id="btnFight" class="btn">Fight</button>
          <button id="btnHeal" class="btn">Rest (Heal to Full)</button>
        </div>
      </div>
    </div>
  `;
  parent.appendChild(wrap);

  const elHP = wrap.querySelector('#pHP');
  const elLog = wrap.querySelector('#combatLog');
  const btnFight = wrap.querySelector('#btnFight');
  const btnHeal = wrap.querySelector('#btnHeal');

  function refreshStats() {
    const p = getPlayer();
    elHP.textContent = `${p.hp}/${p.maxHp}`;
  }
  function append(lines) {
    for (const line of Array.isArray(lines) ? lines : [lines]) {
      const div = document.createElement('div');
      div.textContent = line;
      elLog.appendChild(div);
    }
    elLog.scrollTop = elLog.scrollHeight;
  }

  refreshStats();
  append('You brace for combat…');

  btnFight.addEventListener('click', () => {
    const result = simulateCombat(mobs);
    append(result.transcript);
    append(result.result === 'victory'
      ? `Victory! Loot: ${result.loot.join(', ') || '(none)'}`
      : 'Defeat! You collapse… (try Rest)');
    applyCombatResults(result);
    refreshStats();
    // Disable repeat fights to keep it simple
    btnFight.disabled = true;
  });

  btnHeal.addEventListener('click', () => {
    healToFull();
    refreshStats();
    append('You rest and recover to full health.');
  });

  wrap.querySelector('.btnClose').addEventListener('click', () => {
    parent.removeChild(wrap);
    onClose?.();
  });

  return {
    destroy() { if (wrap.parentNode) parent.removeChild(wrap); }
  };
}
