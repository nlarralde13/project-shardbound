// Lightweight tooltip that asks the renderer to map screen→tile.
export function attachTooltip(container, renderer, { mode = 'auto' } = {}) {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.pointerEvents = 'none';
  el.style.background = 'rgba(0,0,0,0.7)';
  el.style.color = '#fff';
  el.style.padding = '6px 8px';
  el.style.font = '12px/14px system-ui, sans-serif';
  el.style.borderRadius = '6px';
  el.style.transform = 'translate(8px, 8px)';
  el.style.whiteSpace = 'nowrap';
  el.style.display = 'none';
  container.appendChild(el);

  function show(text, x, y) {
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = 'block';
  }

  function hide() { el.style.display = 'none'; }

  container.addEventListener('mousemove', (e) => {
    const { x, y } = renderer.screenToTile(e);
    if (x < 0) { hide(); return; }

    const devMode = mode === 'auto' ? renderer.isDevMode() : mode === 'dev';
    const basic = `Tile (${x}, ${y})`;
    const extra = devMode ? ` — dev: hover` : '';
    show(`${basic}${extra}`, e.clientX - container.getBoundingClientRect().left + 8,
         e.clientY - container.getBoundingClientRect().top + 8);
  });

  container.addEventListener('mouseleave', hide);

  return { destroy: () => container.removeChild(el) };
}
