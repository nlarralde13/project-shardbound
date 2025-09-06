export function hasAt(ST, x, y, normBiome) {
  const flags = { settlement:false, poi:false, shardgate:false, biome:false };
  const S = ST?.shard;
  const L = S?.layers;
  const eq = (e) => ((e?.x ?? e?.[0])|0) === x && ((e?.y ?? e?.[1])|0) === y;
  if (Array.isArray(S?.pois)) {
    if (S.pois.some(eq)) flags.poi = true;
    if (S.pois.some(p => p?.type === 'shardgate' && eq(p))) flags.shardgate = true;
  }
  if (Array.isArray(S?.sites) && S.sites.some(eq)) flags.poi = true;
  if (Array.isArray(L?.shardgates?.nodes) && L.shardgates.nodes.some(eq)) flags.shardgate = true;
  if (Array.isArray(ST?.draft?.pois)) {
    if (ST.draft.pois.some(eq)) flags.poi = true;
    if (ST.draft.pois.some(p => p?.type === 'shardgate' && eq(p))) flags.shardgate = true;
  }
  const SS = L?.settlements || {};
  for (const k of ['cities','towns','villages','ports']) {
    const arr = SS?.[k];
    if (Array.isArray(arr) && arr.some(eq)) { flags.settlement = true; break; }
  }
  if (ST?.baseline && Array.isArray(ST.baseline.tiles) && Array.isArray(S?.tiles) && typeof normBiome === 'function') {
    const bt = ST.baseline.tiles?.[y]?.[x];
    const ct = S.tiles?.[y]?.[x];
    const bb = bt ? normBiome(bt.biome) : null;
    const cb = ct ? normBiome(ct.biome) : null;
    if (bb && cb && bb !== cb) flags.biome = true;
  }
  flags.any = flags.settlement || flags.poi || flags.shardgate || flags.biome;
  return flags;
}

export function removeAt(ST, x, y, kind) {
  const S = ST?.shard; const L = S?.layers;
  const eq = (e) => ((e?.x ?? e?.[0])|0) !== x || ((e?.y ?? e?.[1])|0) !== y; // keep non-matching
  let removed = 0;
  const doSettlements = () => {
    const SS = L?.settlements || {};
    for (const k of ['cities','towns','villages','ports']) {
      const arr = SS[k];
      if (Array.isArray(arr)) {
        const before = arr.length;
        SS[k] = arr.filter(eq);
        removed += before - SS[k].length;
      }
    }
  };
  if (!kind || kind === 'poi') {
    if (Array.isArray(S?.pois)) {
      const before = S.pois.length;
      S.pois = S.pois.filter(eq);
      removed += before - S.pois.length;
    }
    if (Array.isArray(ST?.draft?.pois)) {
      const before = ST.draft.pois.length;
      ST.draft.pois = ST.draft.pois.filter(eq);
      removed += before - ST.draft.pois.length;
    }
  }
  if (!kind || kind === 'site') {
    if (Array.isArray(S?.sites)) {
      const before = S.sites.length;
      S.sites = S.sites.filter(eq);
      removed += before - S.sites.length;
    }
  }
  if (!kind || kind === 'shardgate') {
    if (Array.isArray(S?.pois)) {
      const before = S.pois.length;
      S.pois = S.pois.filter(p => p?.type !== 'shardgate' || eq(p));
      removed += before - S.pois.length;
    }
    if (Array.isArray(L?.shardgates?.nodes)) {
      const before = L.shardgates.nodes.length;
      L.shardgates.nodes = L.shardgates.nodes.filter(eq);
      removed += before - L.shardgates.nodes.length;
    }
    if (Array.isArray(ST?.draft?.pois)) {
      const before = ST.draft.pois.length;
      ST.draft.pois = ST.draft.pois.filter(p => p?.type !== 'shardgate' || eq(p));
      removed += before - ST.draft.pois.length;
    }
  }
  if (!kind || kind === 'settlement') {
    doSettlements();
  }
  return removed;
}
