/**
 * API client with graceful fallback to mock adapter when endpoints are missing.
 * Routes assumed:
 *  GET    /api/shards/:id
 *  PUT    /api/shards/:id (full shard JSON)
 *  PATCH  /api/shards/:id/tiles
 *  POST   /api/shards/:id/pois
 *  PUT    /api/shards/:id/pois/:poi_id
 *  DELETE /api/shards/:id/pois/:poi_id
 */
export function createAPI({ baseUrl = '/api', consoleEl }) {
  const log = (...a) => { console.debug('[api]', ...a); };
  const client = {
    async getShard(id){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { toast('API unavailable, using mock'); return mock.getShard(id); }
    },
    async saveShard(id, json){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}`, {
          method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(json)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json().catch(()=>({ ok:true }));
      } catch (e) { log('saveShard fallback', e); return mock.saveShard(id, json); }
    },
    async patchTiles(id, changes){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}/tiles`, {
          method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ changes })
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { log('patchTiles fallback', e); return mock.patchTiles(id, changes); }
    },
    async batchTilesPatch(id, changes){
      // Alias maintained for external callers
      return this.patchTiles(id, changes);
    },
    async createPOI(id, poi){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}/pois`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(poi)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { log('createPOI fallback', e); return mock.createPOI(id, poi); }
    },
    async updatePOI(id, poi){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}/pois/${encodeURIComponent(poi.id)}`, {
          method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(poi)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { log('updatePOI fallback', e); return mock.updatePOI(id, poi); }
    },
    async deletePOI(id, poiId){
      try {
        const r = await fetch(`${baseUrl}/shards/${encodeURIComponent(id)}/pois/${encodeURIComponent(poiId)}`, { method:'DELETE' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json().catch(()=>({ ok:true }));
      } catch (e) { log('deletePOI fallback', e); return mock.deletePOI(id, poiId); }
    }
  };

  const mem = new Map();
  const mock = {
    async getShard(id){
      if (!mem.has(id)) {
        const j = await fetch('/static/src/shardViewer/dev/mockShard.json').then(r=>r.json());
        j.shard_id = id; mem.set(id, j);
      }
      return structuredClone(mem.get(id));
    },
    async saveShard(id, json){ mem.set(id, structuredClone(json)); return { ok:true, saved: id }; },
    async patchTiles(id, changes){ const s = mem.get(id); for (const c of changes){ s.tiles[c.y][c.x].biome = c.biome; } return { ok:true }; },
    async createPOI(id, poi){ const s = mem.get(id); s.pois.push(poi); return { ok:true, id: poi.id }; },
    async updatePOI(id, poi){ const s = mem.get(id); const i = s.pois.findIndex(p=>p.id===poi.id); if(i>=0) s.pois[i]=poi; return { ok:true }; },
    async deletePOI(id, poiId){ const s = mem.get(id); s.pois = s.pois.filter(p=>p.id!==poiId); return { ok:true }; },
  };

  function toast(msg){
    const el = document.createElement('div'); el.className='toast warn'; el.textContent = msg; document.body.appendChild(el);
    setTimeout(()=>el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); el.remove(); }, 2200);
  }

  return client;
}
