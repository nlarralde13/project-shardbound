import { createPixiRenderer } from '../gfx/pixiRenderer.js';
import { initShardEditor } from './shardEditor.js';

export function mountEditorAndRenderer({
  canvas,
  root = '#rightBar',
  overlayRoot = '#mapViewer',
  shard,
  tileW = 16,
  tileH = 8,
  chunkSize = 64,
} = {}){
  if (!canvas) throw new Error('[mount] missing canvas element');

  const pixi = createPixiRenderer({ canvas, shard: null, tileW, tileH, chunkSize, enableInteractions:true });

  function fit(){
    const w = canvas.clientWidth  || canvas.offsetWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.offsetHeight || canvas.height || 600;
    pixi.resize(w, h);
  }
  fit();
  window.addEventListener('resize', fit, { passive: true });

  pixi.setShard(shard);

  const w = canvas.clientWidth  || canvas.offsetWidth  || canvas.width  || 800;
  const h = canvas.clientHeight || canvas.offsetHeight || canvas.height || 600;
  pixi.setOrigin(Math.floor(w/2), Math.floor(h*0.25));

  const editor = initShardEditor({
    root, overlayRoot, pixi, shard, tileW, tileH,
    originProvider: () => pixi.getOrigin(),
  });

  if (editor && typeof editor.onPanModeChange === 'function'){
    editor.onPanModeChange((enabled)=> pixi.setPanWithLeft(!!enabled));
  }

  window.__pixi = pixi;
  window.__editor = editor;
  return { pixi, editor };
}
