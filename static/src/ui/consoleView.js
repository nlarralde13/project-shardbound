// /static/src/ui/consoleView.js
// Gameboard (console) with integrated command input + log

let root, logEl, inputEl, isMounted = false;
let commandHandler = null;

export function mountConsole(rootSelector = '#mapViewer') {
  if (isMounted) return;

  const host = document.querySelector(rootSelector);
  if (!host) throw new Error('[consoleView] host not found');

  // Reuse an existing #consoleView if present; otherwise create one
  root = document.getElementById('consoleView');
  if (!root) {
    root = document.createElement('div');
    root.id = 'consoleView';
    host.appendChild(root);
  }
  root.classList.add('console-box');

  // Build console UI (log + command input)
  root.innerHTML = `
    <div class="console-wrap">
      <div id="consoleLog" class="console-log" aria-live="polite"></div>
      <div class="console-input-row">
        <input id="commandInput" type="text" placeholder="Type a command and press Enter…" autocomplete="off" />
      </div>
    </div>
  `;

  logEl   = root.querySelector('#consoleLog');
  inputEl = root.querySelector('#commandInput');

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      appendLine(`> ${text}`);
      inputEl.value = '';

      if (typeof commandHandler === 'function') {
        try {
          const res = commandHandler(text);
          if (res instanceof Promise) res.then(out => out && appendLine(out));
          else if (res) appendLine(res);
        } catch (err) {
          appendLine(`[error] ${err?.message || err}`);
        }
      }
    }
  });

  appendLine('Welcome to Shardbound. Type "help" for commands.');
  inputEl.focus();
  isMounted = true;
}

export function unmountConsole() {
  if (!isMounted) return;
  root?.remove();
  root = logEl = inputEl = null;
  isMounted = false;
}

export function showConsole() {
  if (root) root.style.display = 'block';
  inputEl?.focus();
}

export function hideConsole() {
  if (root) root.style.display = 'none';
}

export function appendLine(text) {
  if (!logEl) return;
  const div = document.createElement('div');
  div.className = 'console-line';
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

export function onCommand(fn) {
  commandHandler = fn;
}
