// movementController.js
// Centralizes keyboard handling and delegates movement + actions via callbacks.
// Movement via keys is allowed ONLY when devMode && noclip are both true.

export function createMovementController(opts) {
  const {
    devMode = false,
    noclip = false,
    tryMove,          // async (dir) -> boolean
    tryInteract,      // () -> void
    tryRest,          // () -> void
    onHotkey = {},    // { map, char, inv, escape }
    allowDiagonals = false,
  } = opts || {};

  const state = { devMode, noclip, attached: false };

  const canKeyMove = () => !!(state.devMode && state.noclip);

  function keyToDir(key) {
    if (!canKeyMove()) return null;          // block movement keys in user mode

    const k = key.toLowerCase();
    // Cardinal
    if (k === 'arrowup' || k === 'w' || k === 'k') return 'N';
    if (k === 'arrowright' || k === 'd' || k === 'l') return 'E';
    if (k === 'arrowdown' || k === 's' || k === 'j') return 'S';
    if (k === 'arrowleft' || k === 'a' || k === 'h') return 'W';

    if (!allowDiagonals) return null;

    // Diagonals (optional): Q/E/Z/C or numpad 1/3/7/9
    if (k === 'q' || key === '7') return 'NW';
    if (k === 'e' || key === '9') return 'NE';
    if (k === 'z' || key === '1') return 'SW';
    if (k === 'c' || key === '3') return 'SE';
    return null;
  }

  async function handleKeydown(e) {
    const active = document.activeElement;
    const tag = active?.tagName;
    // Let the user type freely in inputs/textareas
    if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;

    const k = e.key;
    const low = k.toLowerCase();

    // Movement (dev+noclip only)
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
    if (low === 'r') {
      e.preventDefault(); e.stopPropagation();
      tryRest?.();
      return;
    }

    // UI toggles — support B (bag) + C (character) + I (inventory) + M (map)
    if (low === 'b' || low === 'i') { onHotkey?.inv?.(); return; }
    if (low === 'c') { onHotkey?.char?.(); return; }
    if (low === 'm') { onHotkey?.map?.(); return; }
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
