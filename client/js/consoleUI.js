/* consoleUI.js
   Minimal scrollable console with command input.
   Public events: dispatches 'console:command'; listens for 'console:log'.
*/

const logEl = document.getElementById('console-log');
const input = document.getElementById('console-input');

function log(msg) {
  const line = document.createElement('div');
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

document.addEventListener('console:log', (e) => log(e.detail));

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = input.value.trim();
    if (cmd) {
      log('> ' + cmd);
      document.dispatchEvent(new CustomEvent('console:command', { detail: cmd }));
      input.value = '';
    }
  }
});

log('Console ready');

