// movementController.js
// Centralizes keyboard handling and delegates movement + actions via callbacks.

export function createMovementController(opts) {
  const {
    devMode = false,
    noclip = false,
    tryMove,          // function(dir): boolean | Promise<boolean>
    tryInteract,      // function(): void (e.g., ENTER on POI/city)
    tryRest,          // function(): void
    onHotkey = {},    // { map, char, inv, escape }
    allowDiagonals = false,
  } = opts || {};

  const state = { devMode, noclip, attached: false };

  function keyToDir(key) {
    const k = key.toLowerCase();
    // Cardinal
    if (k === 'arrowup' || k === 'w' || k === 'k') return 'N';
    if (k === 'arrowright' || k === 'd' || k === 'l') return 'E';
    if (k === 'arrowdown' || k === 's' || k === 'j') return 'S';
    if (k === 'arrowleft' || k === 'a' || k === 'h') return 'W';
    // Numpad (2/4/6/8)
    if (key === '2') return 'S';
    if (key === '4') return 'W';
    if (key === '6') return 'E';
    if (key === '8') return 'N';

    if (!allowDiagonals) return null;

    // Diagonals (optional): Q/E/Z/C or numpad 1/3/7/9
    if (k === 'q' || key === '7') return 'NW';
    if (k === 'e' || key === '9') return 'NE';
    if (k === 'z' || key === '1') return 'SW';
    if (k === 'c' || key === '3') return 'SE';
    return null;
  }

  async function handleKeydown(e) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    const k = e.key;

    // Movement
    const dir = keyToDir(k);
    if (dir) {
      e.preventDefault(); e.stopPropagation();
      await tryMove?.(dir);
      return;
    }

    // Interact
    if (k === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      tryInteract?.();
      return;
    }

    // Rest
    if (k.toLowerCase() === 'r') {
      e.preventDefault(); e.stopPropagation();
      tryRest?.();
      return;
    }

    // UI toggles
    if (k.toLowerCase() === 'm') { onHotkey?.map?.(); return; }
    if (k.toLowerCase() === 'c') { onHotkey?.char?.(); return; }
    if (k.toLowerCase() === 'i') { onHotkey?.inv?.(); return; }
    if (k === 'Escape') { onHotkey?.escape?.(); return; }
  }

  function attachToWindow() {
    if (state.attached) return;
    window.addEventListener('keydown', handleKeydown, { passive: false });
    state.attached = true;
  }

  function detach() {
    if (!state.attached) return;
    window.removeEventListener('keydown', handleKeydown);
    state.attached = false;
  }

  return {
    attachToWindow,
    detach,
    get devMode() { return state.devMode; },
    get noclip() { return state.noclip; },
  };
}
