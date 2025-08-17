// /static/src/dev/editor/shardEditor.js — iter2.2.7
import { getBiomeList } from '/static/src/data/biomeRegistry.js';
import { tileMetadataSchema, getSliceDefaults } from '/static/src/data/metadataSchema.js';
import { EditorState } from './editorState.js';

export async function startShardEditor({ biomeRegistryPath, defaultShardUrl, worldgenPath } = {}){
  const canvas = document.getElementById('grid'); const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio||1);
  function resize(){ const r=canvas.getBoundingClientRect(); canvas.width=r.width*dpr; canvas.height=r.height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); draw(); }
  window.addEventListener('resize', resize);

  const W=64,H=64, ts=10;
  const tiles = Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>({
    biome:'water/ocean', seed:y*W+x, biomeTier:0, ownerFaction:'neutral', passable:true, tags:[], sliceOptions:{}
  })));

  const biomePick=document.getElementById('biomePick');
  (getBiomeList()).forEach(id=>{ const o=document.createElement('option'); o.value=id; o.textContent=id; biomePick.appendChild(o); });

  let sel=null;
  function draw(){ ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ const t=tiles[y][x]; ctx.fillStyle=t.biome.includes('water')?'#123d6b':'#38543a'; ctx.fillRect(x*ts,y*ts,ts,ts);}}
    if(sel){ ctx.strokeStyle='#f0c674'; ctx.lineWidth=2; ctx.strokeRect(sel.x*ts+0.5,sel.y*ts+0.5,ts-1,ts-1); } }
  resize();

  canvas.addEventListener('click', (e)=>{ const r=canvas.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left)/ts), y=Math.floor((e.clientY-r.top)/ts);
    if(x>=0&&y>=0&&x<W&&y<H){ sel={x,y}; draw(); }});

  document.getElementById('applyMeta').addEventListener('click', ()=>{
    if(!sel) return; const t=tiles[sel.y][sel.x]; const b=biomePick.value||t.biome; t.biome=b; t.sliceOptions={...t.sliceOptions, ...getSliceDefaults(b)}; draw();
  });

  if(worldgenPath){ try{ await import(worldgenPath); }catch(e){ console.warn('[editor] worldgen import failed:',e); } }
  console.log('[editor] ready with schema:', tileMetadataSchema);
}
export default { startShardEditor };
