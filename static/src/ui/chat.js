// static/src/ui/chat.js

/**
 * Chat module: handles chat history rendering and input.
 * 
 * Usage:
 *   import { initChat, sendMessage } from './ui/chat.js';
 *   initChat('#chatHistory', '#chatInput');
 *   sendMessage('Hello world');
 */

const PLAYER_NAME = 'Player1';

/**
 * Initializes the chat UI:
 *  - Seeds the history with a few blank lines
 *  - Attaches an Enter‐key listener to your input box
 * 
 * @param {string} historySelector  CSS selector for the chat history container
 * @param {string} inputSelector    CSS selector for the chat input `<textarea>` or `<input>`
 */
export function initChat(historySelector = '#chatHistory', inputSelector = '#chatInput') {
  const hist = document.querySelector(historySelector);
  const input = document.querySelector(inputSelector);
  if (!hist || !input) {
    console.warn('[chat] Could not find chat elements:', historySelector, inputSelector);
    return;
  }

  // Pre‐fill with 3 blank lines so your layout doesn’t jump
  for (let i = 0; i < 3; i++) {
    hist.appendChild(document.createElement('div'));
  }

  // When the user presses Enter, send the chat
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) {
      sendMessage(`${PLAYER_NAME}: ${input.value.trim()}`);
      input.value = '';
      e.preventDefault();
    }
  });

  console.log('[chat] Initialized chat with selectors:', historySelector, inputSelector);
}

/**
 * Appends a timestamped message into the chat history.
 * @param {string} text  The message text (can include “Player used Slash”, etc.)
 */
export function sendMessage(text) {
  const hist = document.querySelector('#chatHistory');
  if (!hist) {
    console.warn('[chat] sendMessage(): history element not found');
    return;
  }
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const line = document.createElement('div');
  line.textContent = `${hh}:${mm} ${text}`;
  hist.appendChild(line);
  // Auto‐scroll to bottom
  hist.scrollTop = hist.scrollHeight;
  console.log('[chat] Sent message →', text);
}

window.sendChatMessage = sendMessage;
