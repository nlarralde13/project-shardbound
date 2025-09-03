// consoleUI.js - simple in-page console UI
// Exports: mountConsole, print, setPrompt, setStatus, bindHotkeys
// Basic CSS (optional):
/*
#console-root {
  font-family: monospace;
  background: #000;
  color: #eee;
}
#console-root .scrollback {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
#console-root .input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px;
  border: none;
  outline: none;
}
#console-root .status {
  font-size: 12px;
  padding: 2px 4px;
  background: #111;
}
#console-root .system {
  color: #6cf;
}
*/

let rootEl, scrollEl, inputEl, statusEl;
const history = [];
let histIndex = 0;

// mountConsole(rootElement)
// Creates console structure inside rootElement
export function mountConsole(root) {
  if (!root) return;
  rootEl = root;
  rootEl.style.display = 'flex';
  rootEl.style.flexDirection = 'column';
  rootEl.style.height = '200px';
  rootEl.style.background = '#000';
  rootEl.style.color = '#eee';
  rootEl.style.fontFamily = 'monospace';

  scrollEl = document.createElement('div');
  scrollEl.className = 'scrollback';
  scrollEl.style.flex = '1';
  scrollEl.style.overflowY = 'auto';
  scrollEl.style.padding = '4px';

  inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'input';
  inputEl.style.width = '100%';
  inputEl.style.boxSizing = 'border-box';
  inputEl.style.padding = '4px';
  inputEl.style.border = 'none';
  inputEl.style.outline = 'none';
  inputEl.addEventListener('keydown', handleKey); // key events

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.style.fontSize = '12px';
  statusEl.style.padding = '2px 4px';
  statusEl.style.background = '#111';

  rootEl.replaceChildren(scrollEl, inputEl, statusEl);
}

function handleKey(ev) {
  if (ev.key === 'Enter') {
    const val = inputEl.value;
    if (val.trim()) {
      print(val);
      history.push(val);
      histIndex = history.length;
    }
    inputEl.value = '';
  } else if (ev.key === 'ArrowUp') {
    if (histIndex > 0) {
      histIndex--;
      inputEl.value = history[histIndex] || '';
    }
    ev.preventDefault();
  } else if (ev.key === 'ArrowDown') {
    if (histIndex < history.length) {
      histIndex++;
      inputEl.value = history[histIndex] || '';
    }
    ev.preventDefault();
  }
}

// print(lines, opts?) -> append line(s) to scrollback
export function print(lines, opts = {}) {
  if (!scrollEl) return;
  const arr = Array.isArray(lines) ? lines : [lines];
  for (const line of arr) {
    const d = document.createElement('div');
    d.textContent = line;
    if (opts.mode === 'system') d.className = 'system';
    scrollEl.appendChild(d);
  }
  scrollEl.scrollTop = scrollEl.scrollHeight;
}

// setPrompt(text) -> set placeholder
export function setPrompt(text) {
  if (inputEl) inputEl.placeholder = text;
}

// setStatus(info) -> update status bar
export function setStatus(info = {}) {
  if (!statusEl) return;
  const parts = [];
  if (info.hp !== undefined) parts.push(`HP:${info.hp}`);
  if (info.mp !== undefined) parts.push(`MP:${info.mp}`);
  if (info.coords) parts.push(info.coords);
  if (info.target) parts.push(`Target:${info.target}`);
  statusEl.textContent = parts.join(' | ');
}

// bindHotkeys() -> focus input on '/'
export function bindHotkeys() {
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && document.activeElement !== inputEl) {
      ev.preventDefault();
      inputEl?.focus();
    }
  });
}

// expose for debugging
export default { mountConsole, print, setPrompt, setStatus, bindHotkeys };
