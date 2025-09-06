/**
 * Tool state, brushes, keybinds, pointer modes.
 */
export function createToolState({ devMode, brushSizeEl, snapGridEl, onChange }) {
  const st = {
    devMode,
    tool: 'biome',
    brushSize: Number(brushSizeEl?.value || 1),
    snap: !!snapGridEl?.checked,
    poiType: 'site',
    currentBiome: 'grass',
    selection: null,
    pointerOnce: null, // {mode, cb}
    pointerHover: null, // {x,y} when in pointer mode
  };

  /** Set active tool: 'biome' | 'poi' | 'select' */
  st.setTool = (t) => { st.tool = t; onChange?.(); };
  /** Set active POI type. */
  st.setPOIType = (p) => { st.poiType = p; onChange?.(); };
  /** Set selection rectangle in tile coords. */
  st.setSelection = (rect) => { st.selection = rect; onChange?.(); };
  /** One-shot pointer mode e.g., 'pickTarget' */
  st.setPointerModeOnce = (mode, cb) => { st.pointerOnce = { mode, cb }; };
  /** Update hover for pointer mode. */
  st.setPointerHover = (pt) => { st.pointerHover = pt; onChange?.(); };
  /** Cancel any active pointer mode. */
  st.cancelPointerMode = () => { st.pointerOnce = null; st.pointerHover = null; onChange?.(); };
  /** Set current biome used by context and brush. */
  st.setBiome = (b) => { st.currentBiome = b; onChange?.(); };

  brushSizeEl?.addEventListener('change', () => { st.brushSize = Number(brushSizeEl.value || 1); onChange?.(); });
  snapGridEl?.addEventListener('change', () => { st.snap = !!snapGridEl.checked; onChange?.(); });

  // Wire tool buttons
  document.querySelectorAll('[data-tool]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]')?.forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); st.setTool(btn.dataset.tool);
    });
  });

  return st;
}

/** Install keyboard shortcuts. */
export function installKeybinds({ tools, onSave, onLoad, onUndo, onRedo, onToggleGrid, onToggleRegions, onPan }) {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); onSave?.(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); onLoad?.(); }
    if (!e.ctrlKey && e.key.toLowerCase() === 'b') { tools.setTool('biome'); markActive('biome'); }
    if (!e.ctrlKey && e.key.toLowerCase() === 'p') { tools.setTool('poi'); markActive('poi'); }
    if (!e.ctrlKey && e.key.toLowerCase() === 's') { tools.setTool('select'); markActive('select'); }
    if (!e.ctrlKey && e.key === 'z') { if (e.shiftKey) onRedo?.(); else onUndo?.(); }
    if (!e.ctrlKey && e.key === 'g') { onToggleGrid?.(); }
    if (!e.ctrlKey && e.key.toLowerCase() === 'r') { onToggleRegions?.(); }
    if (!e.ctrlKey && (e.key === ',' || e.key === '.')) {
      const delta = e.key === ',' ? -2 : 2;
      const el = document.querySelector('#brushSize'); if (!el) return;
      const val = Math.max(1, Math.min(5, Number(el.value) + delta));
      el.value = String(val); el.dispatchEvent(new Event('change'));
    }
    if (!e.ctrlKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)) {
      const k = e.key; const step = 32;
      if (k==='ArrowUp' || k==='w') onPan?.(0, +step);
      if (k==='ArrowDown' || k==='s') onPan?.(0, -step);
      if (k==='ArrowLeft' || k==='a') onPan?.(+step, 0);
      if (k==='ArrowRight' || k==='d') onPan?.(-step, 0);
    }
    if (e.key === 'Escape') { tools.cancelPointerMode?.(); }
  });
  function markActive(id){
    document.querySelectorAll('[data-tool]')?.forEach(b => b.classList.toggle('active', b.dataset.tool === id));
  }
}
