/**
 * Simple undo/redo stack storing forward and inverse ops.
 */
export function createUndoRedo({ depth = 50, onChange } = {}) {
  const stack = []; let idx = -1;
  function push(action){
    // truncate after idx
    stack.splice(idx+1); stack.push(action);
    if (stack.length > depth) { stack.shift(); } else { idx++; }
    onChange?.();
  }
  function undo(){ if (idx < 0) return null; const a = stack[idx--]; onChange?.(); return a; }
  function redo(){ if (idx >= stack.length-1) return null; const a = stack[++idx]; onChange?.(); return a; }
  function canUndo(){ return idx >= 0; }
  function canRedo(){ return idx < stack.length-1; }
  function clear(){ stack.length = 0; idx = -1; onChange?.(); }
  return { push, undo, redo, canUndo, canRedo, clear };
}
