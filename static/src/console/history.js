// history.js - persistent console input history using localStorage
// Exports: push, prev, next, search

const STORAGE_KEY = 'console_history';
const MAX = 200;

let entries = load();
let index = entries.length;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {
    // ignore
  }
  return [];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    // ignore
  }
}

export function push(line) {
  if (!line) return;
  entries.push(line);
  if (entries.length > MAX) entries = entries.slice(entries.length - MAX);
  index = entries.length;
  save();
}

export function prev() {
  if (index > 0) index--;
  return entries[index] || '';
}

export function next() {
  if (index < entries.length) index++;
  return entries[index] || '';
}

export function search(substr) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].includes(substr)) {
      index = i;
      return entries[i];
    }
  }
  return '';
}

export default { push, prev, next, search };
