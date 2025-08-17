// Lightweight, modern tooltip with POI + biome support.
// API: attachTooltip(container, renderer, { mode: 'auto' | 'dev' | 'user', showBiome=true, showPOI=true })
export function attachTooltip(container, renderer, opts = {}) {
  const {
    mode = 'auto',
    showBiome = true,
    showPOI = true,
    maxWidth = 260,
  } = opts;

  // ---- DOM ----
  const el = document.createElement('div');
  el.className = 'sb-tooltip';
  Object.assign(el.style, {
    position: 'absolute',
    pointerEvents: 'none',
    background: 'rgba(11,14,19,0.92)',
    color: '#e9f0f6',
    padding: '8px 10px',
    font: '12px/16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    borderRadius: '8px',
    border: '1px solid rgba(67,86,112,0.4)',
    boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
    transform: 'translate(8px, 8px) scale(0.98)',
    transformOrigin: 'left top',
    opacity: '0',
    transition: 'opacity 80ms ease, transform 80ms ease',
    whiteSpace: 'normal',
    display: 'none',
    maxWidth: `${maxWidth}px`,
    zIndex: 2001,
  });

  const arrow = document.createElement('div');
  Object.assign(arrow.style, {
    position: 'absolute',
    left: '6px',
    top: '-6px',
    width: '10px',
    height: '10px',
    transform: 'rotate(45deg)',
    background: 'rgba(11,14,19,0.92)',
    borderLeft: '1px solid rgba(67,86,112,0.4)',
    borderTop: '1px solid rgba(67,86,112,0.4)',
  });

  const inner = document.createElement('div');
  container.appendChild(el);
  el.appendChild(arrow);
  el.appendChild(inner);

  // ---- state ----
  let visible = false;
  let rafId = 0;
  let lastMouse = { x: 0, y: 0 }; // relative to container
  let lastTile = { x: -1, y: -1, biome: 'ocean', pois: [] };

  function isDev() {
    return mode === 'dev' || (mode === 'auto' && renderer?.isDevMode?.());
  }

  function show() {
    if (visible) return;
    el.style.display = 'block';
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(8px, 8px) scale(1)';
    });
    visible = true;
  }

  function hide() {
    if (!visible) return;
    el.style.opacity = '0';
    el.style.transform = 'translate(8px, 8px) scale(0.98)';
    setTimeout(() => { el.style.display = 'none'; }, 90);
    visible = false;
  }

  function formatPOI(p) {
    // Render a compact label. If you store name/type, surface both.
    const icon = p.type === 'port' ? '⚓' :
                 p.type === 'town' ? '🏰' :
                 p.type === 'dungeon' ? '🕳️' :
                 '◆';
    const name = p.name ? ` — ${p.name}` : '';
    return `${icon} ${p.type || 'POI'}${name}`;
  }

  function renderContent(data) {
    const { x, y, biome, pois = [] } = data;
    const dev = isDev();

    const rows = [];
    rows.push(`<div><strong>Tile:</strong> (${x}, ${y})</div>`);
    if (showBiome) rows.push(`<div><strong>Biome:</strong> ${biome}</div>`);

    if (showPOI) {
      if (pois.length) {
        const list = pois.slice(0, 4).map(formatPOI).join('<br/>');
        const more = pois.length > 4 ? `<div style="opacity:.7">+${pois.length - 4} more…</div>` : '';
        rows.push(`<div><strong>POI:</strong><br/>${list}${more}</div>`);
      } else {
        rows.push(`<div><strong>POI:</strong> —</div>`);
      }
    }

    if (dev) {
      rows.push(`<div style="opacity:.7"><strong>Dev:</strong> hover</div>`);
    }

    inner.innerHTML = rows.join('');
  }

  function positionNearMouse() {
    const rect = container.getBoundingClientRect();
    // Preferred position near mouse; avoid edges
    const pad = 10;
    const offset = 12;
    let lx = lastMouse.x + offset;
    let ly = lastMouse.y + offset;

    el.style.left = `${lx}px`;
    el.style.top = `${ly}px`;

    // Post-place edge avoidance
    const ew = el.offsetWidth;
    const eh = el.offsetHeight;
    const maxX = rect.width - pad - ew;
    const maxY = rect.height - pad - eh;

    if (lx > maxX) el.style.left = `${Math.max(pad, maxX)}px`;
    if (ly > maxY) {
      el.style.top = `${Math.max(pad, maxY)}px`;
      arrow.style.top = `${eh - 4}px`; // move arrow to bottom if we had to push up
    } else {
      arrow.style.top = '-6px';
    }
  }

  function updateFromTile() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (lastTile.x < 0) { hide(); return; }
      renderContent(lastTile);
      positionNearMouse();
      show();
    });
  }

  // ---- Event: primary data path from renderer (recommended) ----
  function onHoverEvent(e) {
    const data = e.detail;
    if (!data) { lastTile = { x: -1, y: -1, biome: 'ocean', pois: [] }; hide(); return; }
    lastTile = {
      x: data.x, y: data.y,
      biome: data.biome ?? 'ocean',
      pois: Array.isArray(data.pois) ? data.pois : [],
    };
    updateFromTile();
  }
  window.addEventListener('map:hoverTile', onHoverEvent);

  // ---- Fallback: derive tile via renderer if no event is emitted ----
  function onMouseMove(e) {
    const r = container.getBoundingClientRect();
    lastMouse.x = e.clientX - r.left;
    lastMouse.y = e.clientY - r.top;

    // If the renderer provides an event already, prefer that.
    // Otherwise, compute from screenToTile and show minimal info.
    if (lastTile.x >= 0) { positionNearMouse(); return; }

    const tile = renderer?.screenToTile?.(e) ?? { x: -1, y: -1 };
    if (tile.x < 0) { hide(); return; }

    lastTile = { x: tile.x, y: tile.y, biome: 'unknown', pois: [] };
    updateFromTile();
  }

  function onMouseLeave() {
    lastTile = { x: -1, y: -1, biome: 'ocean', pois: [] };
    hide();
  }

  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseleave', onMouseLeave);

  // Cleanup API
  function destroy() {
    window.removeEventListener('map:hoverTile', onHoverEvent);
    container.removeEventListener('mousemove', onMouseMove);
    container.removeEventListener('mouseleave', onMouseLeave);
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  return { destroy };
}
