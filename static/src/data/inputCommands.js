// Central source of truth for input mappings (keyboard + helpers)
// Keep ALL keybindings here and import this from main.

import { applyZoom, getZoomLevel } from '../ui/camera.js';
import { goWorld } from '../state/viewportState.js';

// Optional camera nudge; if you expose moveCameraBy in camera.js, you can import it.
// import { moveCameraBy } from '../ui/camera.js';

export function initInputCommands({ wrapper, canvas, runCommand, onFocusConsole } = {}) {
  // --- Keyboard commands ---
  window.addEventListener('keydown', (e) => {
    const k = e.key;

    // Focus console input
    if (k === '/' && onFocusConsole) {
      e.preventDefault();
      onFocusConsole();
      return;
    }

    // Map focus
    if (k.toLowerCase() === 'm') {
      goWorld();
      return;
    }

    // Zoom
    if (k === '+' || k === '=') {
      const { x, y } = centerOfCanvas(canvas);
      applyZoom(getZoomLevel() + 0.1, x, y);
      e.preventDefault();
      return;
    }
    if (k === '-') {
      const { x, y } = centerOfCanvas(canvas);
      applyZoom(getZoomLevel() - 0.1, x, y);
      e.preventDefault();
      return;
    }

    // Example: camera pan nudges (uncomment if you wire moveCameraBy)
    // if (k === 'ArrowUp')    { moveCameraBy(0, -1); e.preventDefault(); }
    // if (k === 'ArrowDown')  { moveCameraBy(0,  1); e.preventDefault(); }
    // if (k === 'ArrowLeft')  { moveCameraBy(-1, 0); e.preventDefault(); }
    // if (k === 'ArrowRight') { moveCameraBy(1,  0); e.preventDefault(); }
  });

  // --- (Optional) clickable helpers to dispatch commands from UI elements ---
  // Example: wire a data-cmd attribute to runCommand
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cmd]');
    if (!el) return;
    const cmd = el.getAttribute('data-cmd');
    if (cmd && runCommand) {
      runCommand(cmd);
    }
  });
}

function centerOfCanvas(canvas) {
  return {
    x: (canvas?.width || 0) / 2,
    y: (canvas?.height || 0) / 2,
  };
}
