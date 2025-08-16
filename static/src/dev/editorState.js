// /static/src/dev/editorState.js
// Central editor state: tools, selection, undo/redo, rectangle selection.

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

export const editorState = {
  tool: 'brush', // 'brush' | 'eyedropper' | 'select' | 'rect'
  brush: { size: 1, biome: 'grass' },
  invert: false, // Alt held = invert/erase for paint
  selected: null,               // {x,y} or null
  rectSel: null,                // {x0,y0,x1,y1}
  _batchOpen: false,
  _batch: [],
  _undo: [],
  _redo: [],
};

export function beginBatch(label='edit'){
  if (editorState._batchOpen) return;
  editorState._batchOpen = true;
  editorState._batch = [];
  editorState._batch.label = label;
}

export function pushChange(change){
  // change: { x, y, kind: 'paint'|'metadata', prev:Snap, next:Snap }
  if (editorState._batchOpen) editorState._batch.push(change);
  else editorState._undo.push([change]);
}

export function commitBatch(){
  if (!editorState._batchOpen) return;
  if (editorState._batch.length) editorState._undo.push(editorState._batch.slice());
  editorState._batchOpen = false;
  editorState._batch = [];
  // any new edit invalidates redo chain
  editorState._redo.length = 0;
}

export function undo(shard){
  const group = editorState._undo.pop();
  if (!group) return false;
  for (let i=group.length-1;i>=0;i--){
    const c = group[i];
    Object.assign(shard.tiles[c.y][c.x], c.prev);
  }
  editorState._redo.push(group);
  return true;
}

export function redo(shard){
  const group = editorState._redo.pop();
  if (!group) return false;
  for (const c of group){
    Object.assign(shard.tiles[c.y][c.x], c.next);
  }
  editorState._undo.push(group);
  return true;
}

export function setSelectedPoint(x,y){ editorState.selected = (x==null||y==null)?null:{x,y}; }

export function setRectSelection(ax,ay,bx,by, shard){
  if (ax==null||ay==null||bx==null||by==null){ editorState.rectSel = null; return; }
  const x0 = clamp(Math.min(ax,bx), 0, shard.width-1);
  const y0 = clamp(Math.min(ay,by), 0, shard.height-1);
  const x1 = clamp(Math.max(ax,bx), 0, shard.width-1);
  const y1 = clamp(Math.max(ay,by), 0, shard.height-1);
  editorState.rectSel = { x0,y0,x1,y1 };
}

export function* rectTiles(shard){
  const r = editorState.rectSel;
  if (!r) return;
  for (let y=r.y0; y<=r.y1; y++){
    for (let x=r.x0; x<=r.x1; x++){
      yield { x,y };
    }
  }
}
