// /static/src/dev/editor/editorState.js — shim for undo/redo
export class EditorState{ constructor(){ this.stack=[]; this.index=-1; }
  push(p){ this.stack.splice(this.index+1); this.stack.push(p); this.index=this.stack.length-1; }
  canUndo(){ return this.index>=0;} canRedo(){ return this.index<this.stack.length-1;}
  undo(apply){ if(!this.canUndo()) return; const p=this.stack[this.index--]; if(apply) apply(p,true); }
  redo(apply){ if(!this.canRedo()) return; const p=this.stack[++this.index]; if(apply) apply(p,false); } }
export default EditorState;
