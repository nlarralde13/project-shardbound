// Minimal combat UI
export function renderCombat(container, state, onAttack) {
  container.innerHTML = '';
  const log = document.createElement('div');
  log.className = 'combat-log';
  const btn = document.createElement('button');
  btn.textContent = 'Attack';
  btn.onclick = () => onAttack(state);
  container.appendChild(log);
  container.appendChild(btn);
}
