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

import * as history from './history.js';
import { complete } from './completions.js';

let rootEl, scrollEl, inputEl, statusEl, compEl, submitFn;

// mountConsole(rootElement, { onSubmit })
// Creates console structure inside rootElement
// Returns controller with console helpers
export function mountConsole(root, { onSubmit } = {}) {
  if (!root) return {};
  submitFn = onSubmit;
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

  compEl = document.createElement('div');
  compEl.className = 'completions';
  compEl.style.position = 'absolute';
  compEl.style.background = '#111';
  compEl.style.color = '#eee';
  compEl.style.fontSize = '12px';
  compEl.style.padding = '2px 4px';
  compEl.style.display = 'none';
  compEl.style.zIndex = '10';
  compEl.style.left = '4px';
  compEl.style.bottom = '24px';

  statusEl = document.createElement('div');
  statusEl.className = 'status';
  statusEl.style.fontSize = '12px';
  statusEl.style.padding = '2px 4px';
  statusEl.style.background = '#111';

  rootEl.style.position = 'relative';
  rootEl.replaceChildren(scrollEl, inputEl, compEl, statusEl);

  return { print, setPrompt, setStatus, renderFrames, bindHotkeys };
}

async function handleKey(ev) {
  if (ev.key === 'Enter') {
    const val = inputEl.value;
    if (val.trim()) {
      print(val);
      history.push(val);
      if (submitFn) {
        try {
          const frames = await submitFn(val, {});
          renderFrames(frames);
        } catch (err) {
          print(String(err), { mode: 'system' });
        }
      }
    }
    inputEl.value = '';
    compEl.style.display = 'none';
  } else if (ev.key === 'ArrowUp') {
    inputEl.value = history.prev();
    ev.preventDefault();
  } else if (ev.key === 'ArrowDown') {
    inputEl.value = history.next();
    ev.preventDefault();
  } else if (ev.key === 'Tab') {
    const { suggestion, list } = complete(inputEl.value);
    if (suggestion) inputEl.value = suggestion;
    if (list.length) {
      compEl.innerHTML = list.join('<br>');
      compEl.style.display = 'block';
    } else {
      compEl.style.display = 'none';
    }
    ev.preventDefault();
  } else {
    compEl.style.display = 'none';
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

// renderFrames(frames) -> handle console frames (text/status)
export function renderFrames(frames = []) {
  if (!Array.isArray(frames)) return;
  for (const f of frames) {
    if (f.type === 'status') {
      setStatus(f.data);
    } else if (f.type === 'text') {
      print(f.data);
    } else if (f.type === 'table') {
      const rows = f.data || [];
      for (const row of rows) print(Object.values(row).join(' '));
    }
  }
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
export default { mountConsole, print, setPrompt, setStatus, bindHotkeys, renderFrames };
