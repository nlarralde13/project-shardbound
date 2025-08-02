// /static/src/utils/keyboard.js

// Holds the current state of each key
const keyState = new Set();

// A map of event-type → array of listeners
const listeners = {
  keydown: [],
  keyup:    [],
  press:    []  // “press” could fire once per keydown
};

// Attach the global listeners
window.addEventListener('keydown', e => {
  if (!keyState.has(e.key)) {
    keyState.add(e.key);
    // fire any “press” listeners
    listeners.press.forEach(fn => fn(e));
  }
  // always fire keydown listeners
  listeners.keydown.forEach(fn => fn(e));
});

window.addEventListener('keyup', e => {
  keyState.delete(e.key);
  listeners.keyup.forEach(fn => fn(e));
});

// Public API
export const keyboard = {
  // Check if a key is currently held down
  isDown(key) {
    return keyState.has(key);
  },

  // Subscribe to raw DOM events
  onKeyDown(fn) {
    listeners.keydown.push(fn);
  },
  onKeyUp(fn) {
    listeners.keyup.push(fn);
  },
  // Subscribe to “press” (first keydown)
  onPress(fn) {
    listeners.press.push(fn);
  },

  // Unsubscribe helpers, if you like
  offKeyDown(fn) {
    listeners.keydown = listeners.keydown.filter(f => f !== fn);
  },
  offKeyUp(fn) {
    listeners.keyup = listeners.keyup.filter(f => f !== fn);
  },
  offPress(fn) {
    listeners.press = listeners.press.filter(f => f !== fn);
  }
};
