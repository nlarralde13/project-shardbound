// Lightweight API client for v2 viewer. Defensive fetch with small toast.
// Endpoints (Flask):
//  POST   /api/shards/:id/pois
//  PUT    /api/shards/:id/pois/:poi_id
//  DELETE /api/shards/:id/pois/:poi_id
//  PATCH  /api/shards/:id/tiles

export function createV2API(baseUrl = '/api') {
  const toast = (msg) => {
    try {
      const el = document.createElement('div'); el.className = 'toast warn'; el.textContent = msg;
      document.body.appendChild(el); setTimeout(()=>el.classList.add('show'));
      setTimeout(()=>{ el.classList.remove('show'); el.remove(); }, 2400);
    } catch {}
  };
  const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return { ok:false, error:'Invalid JSON' }; } };
  const handle = async (p, fallbackMsg) => {
    try { const r = await p; if (!r.ok) { const data = await j(r); throw new Error(data?.error || `HTTP ${r.status}`); } return await j(r); }
    catch (e) { console.error('[api]', fallbackMsg || 'request failed', e); toast(fallbackMsg || String(e.message||e)); throw e; }
  };
  const enc = encodeURIComponent;
  return {
    async createPoi(shardId, payload){
      return handle(fetch(`${baseUrl}/shards/${enc(shardId)}/pois`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }), 'Create POI failed');
    },
    async updatePoi(shardId, poiId, payload){
      return handle(fetch(`${baseUrl}/shards/${enc(shardId)}/pois/${enc(poiId)}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }), 'Update POI failed');
    },
    async deletePoi(shardId, poiId){
      return handle(fetch(`${baseUrl}/shards/${enc(shardId)}/pois/${enc(poiId)}`, { method:'DELETE' }), 'Delete POI failed');
    },
    async batchTilesPatch(shardId, updates){
      return handle(fetch(`${baseUrl}/shards/${enc(shardId)}/tiles`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ changes: updates }) }), 'Patch tiles failed');
    }
  };
}

