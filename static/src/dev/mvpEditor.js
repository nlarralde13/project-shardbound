// static/src/dev/mvpEditor.js  — Minimal MVP Editor (biome-on-click)
export function mountMVPEditor({
  root = '#rightBar',
  canvas,
  pixi,
  shard,
  tileW = 32,
  tileH = 16,
  getOrigin = () => ({ x: 0, y: 0 }),
  markDirty = (x,y) => pixi?.markTileDirty?.(x,y),
}) {
  const host = typeof root === 'string' ? document.querySelector(root) : root;
  if (!host) throw new Error('[mvpEditor] host not found');

  host.innerHTML = `
    <div class="panelBox">
      <div class="panel-toggle"><strong>Shard Editor</strong></div>
      <label style="display:block;margin:8px 0;">
        <span>Biome</span>
        <select id="mvpBiome" style="width:100%;padding:6px;">
          <option value="water">water</option>
          <option value="grass">grass</option>
          <option value="forest">forest</option>
          <option value="desert">desert</option>
          <option value="tundra">tundra</option>
          <option value="mountain">mountain</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0;">
        <input type="checkbox" id="paintToggle" checked />
        <span>Paint on click</span>
      </label>
      <div style="font:12px ui-monospace,monospace;opacity:.8;">Drag/zoom unchanged. Click a tile to set the selected biome.</div>
    </div>
  `;

  const biomePick  = host.querySelector('#mvpBiome');
  const paintToggle= host.querySelector('#paintToggle');

  // Helpers mirrored from your main.js picking
  const hx = tileW/2, hy = tileH/2;
  function toWorld(mx, my) {
    const w = pixi?.world || pixi?.stage;
    const s = w?.scale?.x || 1;
    const pos = w?.position || { x: 0, y: 0 };
    return { x: (mx - pos.x) / s, y: (my - pos.y) / s };
  }
  function screenToTileIso(x, y, origin) {
    const dx = x - origin.x, dy = y - origin.y;
    const ix = Math.floor((dx / hx + dy / hy) * 0.5);
    const iy = Math.floor((dy / hy - dx / hx) * 0.5);
    if (ix < 0 || iy < 0 || ix >= shard.width || iy >= shard.height) return null;
    return { x: ix, y: iy };
  }

  function getTileFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    return screenToTileIso(w.x, w.y, getOrigin());
  }

  // Single click to paint if toggle is on (does not interfere with pan/zoom)
  function handleClick(e) {
    if (!paintToggle.checked) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = getTileFromEvent(e);
    if (!t) return;
    const tile = shard.tiles[t.y][t.x];
    const next = biomePick.value;
    if (tile.biome === next) return;
    tile.biome = next;
    try { markDirty?.(t.x, t.y); } catch {}
  }

  canvas.addEventListener('click', handleClick, { passive: true });
  const autoChk = host.querySelector('#autoApplySelected');
  function paintTileAt(t) {
    if (!t) return;
    const { x, y } = t;
    if (x < 0 || y < 0 || x >= shard.width || y >= shard.height) return;
    const tile = shard.tiles[y][x];
    const next = biomePick.value;
    if (tile.biome === next) return;
    tile.biome = next;
    try { markDirty?.(x, y); } catch {}
  }
  window.addEventListener('tile-selected', (ev) => {
    if (!autoChk?.checked) return;
    paintTileAt(ev?.detail);
  });
  biomePick.addEventListener('change', () => {
    if (!autoChk?.checked) return;
    paintTileAt(window.__lastSelectedTile);
  });


  return {
    get selectedBiome(){ return biomePick.value; },
    set selectedBiome(v){ biomePick.value = v; },
    destroy(){ canvas.removeEventListener('click', handleClick); }
  };
}
