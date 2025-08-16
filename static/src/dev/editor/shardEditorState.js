// static/src/dev/editor/shardEditorState.js (v2)
/*
  Undo/Redo
  ---------
  - Stores small per-tile diffs: { x, y, prev, next }
  - Batching groups many ops (e.g., painting with a big brush) into a single history entry.
  - Extendable to rectangle-apply: open a batch, push ops for each tile, commit.
*/
export class EditorState {
  constructor(){
    this.undoStack = [];
    this.redoStack = [];
    this.batch = null;
    this.selected = null;
    this.brush = { biome: 'land/grassland', size: 1 };
  }
  beginBatch(type='batch'){ this.batch = { type, ops: [] }; }
  pushOp(op){ (this.batch ? this.batch.ops : this.undoStack).push(this.batch ? op : { type:'single', ops:[op] }); this.redoStack.length = 0; }
  commitBatch(){ if (this.batch && this.batch.ops.length) this.undoStack.push(this.batch); this.batch = null; }
  _applyOps(shard, ops, useNext){ for (const op of ops){ const t = shard.tiles[op.y][op.x]; shard.tiles[op.y][op.x] = { ...t, ...(useNext?op.next:op.prev) }; } }
  undo(shard){ const item = this.undoStack.pop(); if (!item) return false; this._applyOps(shard, item.ops, false); this.redoStack.push(item); return true; }
  redo(shard){ const item = this.redoStack.pop(); if (!item) return false; this._applyOps(shard, item.ops, true);  this.undoStack.push(item); return true; }
}
