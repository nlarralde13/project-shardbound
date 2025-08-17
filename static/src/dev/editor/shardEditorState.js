// editor1.2 — staging + undo/redo
export class EditorState {
  constructor(){
    this.selected = null;             // {x,y}
    this.brush = { biome: 'land/grassland', size: 1, enabled: false };
    this.staged = null;               // {x,y, meta:{}}
    this._batch = null;
    this._ops = [];                   // history stack of {x,y, prev, next}
    this._idx = -1;
  }
  setBrushEnabled(on){ this.brush.enabled = !!on; }
  setBrushBiome(b){ if (b) this.brush.biome = b; }
  setBrushSize(n){ this.brush.size = Math.max(1, Math.min(9, n|0)); }

  stage(x,y,meta){ this.staged = { x,y, meta: structuredClone(meta||{}) }; }
  clearStage(){ this.staged = null; }

  beginBatch(label){ this._batch = { label, ops: [] }; }
  pushOp(op){ (this._batch ? this._batch.ops : this._ops).push(op); }
  commitBatch(){
    if (!this._batch) return;
    // Truncate redo tail
    this._ops.splice(this._idx+1);
    this._ops.push(...this._batch.ops);
    this._idx = this._ops.length - 1;
    this._batch = null;
  }
  undo(shard){
    if (this._idx < 0) return false;
    const op = this._ops[this._idx--];
    shard.tiles[op.y][op.x] = structuredClone(op.prev);
    return true;
  }
  redo(shard){
    if (this._idx >= this._ops.length-1) return false;
    const op = this._ops[++this._idx];
    shard.tiles[op.y][op.x] = structuredClone(op.next);
    return true;
  }
}
export default EditorState;
