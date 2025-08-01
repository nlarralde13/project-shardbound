// ui/actions.js
// Handles DevTools “action” buttons and routes them into chat

import { sendMessage } from './chat.js'; // adjust path as needed

/**
 * initActionButtons
 * Wires every button matching `selector` so that clicking it
 * sends a “Player used X” message into chat.
 *
 * @param {string} selector   CSS selector for your action buttons
 * @param {string} playerName Name to prefix each action (e.g. “Player1”)
 */
export function initActionButtons(selector, playerName) {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      // read either data-action attr or button text as fallback
      const action = btn.dataset.action || btn.textContent.trim();
      sendMessage(`${playerName} used ${action}`);
      console.log(`[actions] ${playerName} used ${action}`);
    });
  });
}
