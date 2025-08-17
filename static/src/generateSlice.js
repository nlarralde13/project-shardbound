// shards/generateSlice.js
// Build a 3×3 "slice" centered on a shard tile. Deterministic by sid/tx/ty.

function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}}
function seedFrom(sid, tx, ty){ // cheap seed from string + coords
  let h = 2166136261>>>0;
  for (let i=0;i<sid.length;i++){ h ^= sid.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = (h ^ (tx*374761393))>>>0; h = Math.imul(h, 2654435761)>>>0;
  h = (h ^ (ty*1274126177))>>>0; h = Math.imul(h, 1597334677)>>>0;
  return h>>>0;
}

export function generateSlice({ sid, center:{tx,ty} }) {
  const width = 3, height = 3;
  const rng = mulberry32(seedFrom(sid, tx, ty));
  const kinds = ['inn','market','plaza','house','gate','well','workshop','empty'];

  const tiles = [];
  for (let y=0;y<height;y++){
    const row = [];
    for (let x=0;x<width;x++){
      const k = kinds[Math.floor(rng()*kinds.length)];
      row.push({ kind:k, name:k==='inn'?'The Silver Flask Inn':undefined });
    }
    tiles.push(row);
  }

  return {
    id: `slice:${sid}:${tx},${ty}`,
    type: 'slice',
    parent: { sid, center:{tx,ty} },
    width, height,
    tiles
  };
}
