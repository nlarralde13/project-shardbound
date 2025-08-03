// ui/actions.js
// Handles DevTools “action” buttons and routes them into chat

import { sendMessage } from './chat.js'; // adjust path as needed
import { generateMiniShard } from '../slices/generateMiniShard.js';
import { getState } from '../utils/state.js';

/**
 * initActionButtons
 * Wires every button matching `selector` so that clicking it
 * sends a “Player used X” message into chat.
 *
 * @param {string} selector   CSS selector for your action buttons
 * @param {string} playerName Name to prefix each action (e.g. “Player1”)
 */
export function initActionButtons(selector = '.action-btn') {
  const left = document.getElementById('actionLeft');
  const right = document.getElementById('actionRight');

  const actions = [
    '🗡️ Slash', '🔥 Fireball', '🛡️ Block',
    '❄️ Icebolt', '⚡ Zap', '💥 Smash',
    '🎯 Aim', '🧪 Potion', '🦴 Bone Throw',
    '🔮 Cast', '🐾 Track', '📯 Explore'
  ];

  actions.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.title = label;
    btn.textContent = label.split(' ')[0];

    // ✨ Special case for Explore
    if (label.includes('Explore')) {
      btn.onclick = () => {
        const tile = getState('selectedTile');
        if (tile) {
          sendMessage(`Player used ${label}`);
          generateMiniShard(tile);
        } else {
          sendMessage('No tile selected to explore!');
        }
      };
    } else {
      btn.onclick = () => sendMessage(`Player used ${label}`);
    }

    if (i < 6) left.appendChild(btn);
    else right.appendChild(btn);
  });
}

