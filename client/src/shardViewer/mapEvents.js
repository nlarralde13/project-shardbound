/**
 * Centralized map input: mouse pan/zoom, paint, selection, POI actions.
 */
export function installMapEvents({ canvases, cam, tools, getShard, onPaintBiome, onFloodFill, onPlacePOI, onMovePOI, onSelectRect, onRequestRedraw, onTileClick, onOpenContext }) {
  const root = canvases[0].parentElement; // canvasStack
  let isPanning = false; let panStart = { x: 0, y: 0 };
  let selecting = false; let selStart = null;
  let draggingPOI = null;

  for (const c of canvases) {
    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);
    c.addEventListener('wheel', onWheel, { passive: true });
    c.addEventListener('contextmenu', (e) => {
      const shard = getShard(); if (!shard) return;
      e.preventDefault();
      const { x, y } = localXY(e);
      const tile = cam.screenToTile(x, y);
      if (tile && typeof tile.x === 'number' && typeof tile.y === 'number') {
        onOpenContext?.({ tile, screen: { left: e.clientX, top: e.clientY } });
      }
    });
  }

  function onDown(e) {
    const shard = getShard(); if (!shard) return;
    const { x, y } = localXY(e);
    const tile = cam.screenToTile(x, y);
    if (e.button === 1 || (e.button === 0 && e.altKey)) { // middle or alt-left: pan
      isPanning = true; panStart = { x: e.clientX, y: e.clientY };
      return;
    }
    // One-shot pointer mode
    if (tools.pointerOnce) {
      const cb = tools.pointerOnce.cb; tools.setPointerHover?.(null); tools.pointerOnce = null; cb?.(tile.x, tile.y); return;
    }
    if (e.button === 0) {
      // emit tile click for logging/inspection
      const tt = shard.tiles[tile.y]?.[tile.x]; if (tt) onTileClick?.({ x: tile.x, y: tile.y, tile: tt });
      if (tools.tool === 'biome') {
        if (e.ctrlKey) onFloodFill?.(tile);
        else paintBrush(tile);
      } else if (tools.tool === 'select') {
        selecting = true; selStart = tile; onSelectRect({ x0: tile.x, y0: tile.y, x1: tile.x, y1: tile.y });
      } else if (tools.tool === 'poi') {
        const hit = hitPOI(tile);
        if (hit) { draggingPOI = hit; }
        else { onPlacePOI({ x: tile.x, y: tile.y, type: tools.poiType }); }
      }
    }
  }
  function onMove(e) {
    const shard = getShard(); if (!shard) return;
    const { x, y } = localXY(e);
    const tile = cam.screenToTile(x, y);
    // update pointer hover highlight if active
    if (tools.pointerOnce) { tools.setPointerHover?.({ x: tile.x, y: tile.y }); onRequestRedraw?.(); }
    if (isPanning) {
      cam.pan(e.clientX - panStart.x, e.clientY - panStart.y);
      panStart = { x: e.clientX, y: e.clientY };
      onRequestRedraw();
      return;
    }
    if (selecting) {
      onSelectRect(normRect(selStart, tile));
      return;
    }
    if (draggingPOI) {
      onMovePOI(draggingPOI.id, { x: tile.x, y: tile.y });
      return;
    }
    if (e.buttons === 1 && tools.tool === 'biome') {
      paintBrush(tile);
    }
  }
  function onUp() { isPanning = false; selecting = false; draggingPOI = null; }
  function onWheel(e) { if (e.deltaY > 0) cam.zoomDelta(-0.1); else cam.zoomDelta(+0.1); }

  function localXY(e) {
    const rect = root.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function paintBrush(tile) {
    const r = tools.brushSize;
    const pts = [];
    for (let dy = -Math.floor(r/2); dy <= Math.floor(r/2); dy++)
      for (let dx = -Math.floor(r/2); dx <= Math.floor(r/2); dx++)
        pts.push({ x: tile.x + dx, y: tile.y + dy });
    onPaintBiome(pts, tools.currentBiome || 'grass');
  }
  function hitPOI(tile) {
    const shard = getShard();
    return (shard?.pois||[]).find(p => p.x === tile.x && p.y === tile.y);
  }
}

function normRect(a, b){
  return { x0: Math.min(a.x,b.x), y0: Math.min(a.y,b.y), x1: Math.max(a.x,b.x), y1: Math.max(a.y,b.y) };
}
