/**
 * Editor worker (optional): heavy operations like flood-fill or batch transforms.
 * Message protocol:
 *  { type:'floodFill', tiles, start:{x,y}, matchBiome, newBiome } -> { type:'floodFill:done', changes:[{x,y,biome}] }
 */
self.onmessage = (e) => {
  const msg = e.data;
  if (msg?.type === 'floodFill') {
    const { tiles, start, matchBiome, newBiome } = msg;
    const H = tiles.length, W = tiles[0].length;
    const seen = new Set();
    const key = (x,y)=>x+','+y;
    const changes = [];
    const q = [start];
    while (q.length) {
      const { x, y } = q.pop();
      if (x<0||y<0||x>=W||y>=H) continue;
      if (seen.has(key(x,y))) continue; seen.add(key(x,y));
      if (tiles[y][x].biome !== matchBiome) continue;
      changes.push({ x, y, biome: newBiome });
      q.push({x+1,y}); q.push({x-1,y}); q.push({x,y+1}); q.push({x,y-1});
    }
    self.postMessage({ type:'floodFill:done', changes });
  }
};

