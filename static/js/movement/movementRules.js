// static/js/movement/movementRules.js
export function createMovementRules(shard) {
  const size = shard?.size || [16, 16];
  const W = size[0], H = size[1];

  // Build quick lookup sets for roads and bridges from shard layers
  const roadSet = new Set();
  const bridgeSet = new Set();
  const roads = shard?.layers?.roads || {};
  (roads.paths || []).forEach(seg => {
    seg.forEach(p => {
      const x = Array.isArray(p) ? p[0] : p?.x;
      const y = Array.isArray(p) ? p[1] : p?.y;
      if (x != null && y != null) roadSet.add(`${x},${y}`);
    });
  });
  (roads.bridges || []).forEach(b => {
    const x = Array.isArray(b) ? b[0] : b?.x;
    const y = Array.isArray(b) ? b[1] : b?.y;
    if (x != null && y != null) bridgeSet.add(`${x},${y}`);
  });

  const blocked = new Set(((shard?.layers?.movement || {}).blocked_for || {}).land?.map(
    c => `${Array.isArray(c) ? c[0] : c?.x},${Array.isArray(c) ? c[1] : c?.y}`
  ) || []);
  const needBoat = new Set(((shard?.layers?.movement || {}).requires || {}).boat?.map(
    c => `${Array.isArray(c) ? c[0] : c?.x},${Array.isArray(c) ? c[1] : c?.y}`
  ) || []);

  const IMPASSABLE = new Set(["Mountains", "Volcano"]);

  const biomeAt = (x, y) => {
    if (!shard?.grid) return "Forest";
    if (x < 0 || y < 0 || x >= W || y >= H) return "void";
    return shard.grid[y][x];
  };
  const key = (x, y) => `${x},${y}`;
  const onRoad   = (x, y) => roadSet.has(key(x, y));
  const onBridge = (x, y) => bridgeSet.has(key(x, y));

  function passable(x, y, actor, opts) {
    if (opts?.devMode && opts?.noclip) return { ok: true, why: "noclip" };
    if (x < 0 || y < 0 || x >= W || y >= H) return { ok: false, why: "bounds" };

    const KR = key(x, y);
    const roadish = onRoad(x, y) || onBridge(x, y);

    // Layer restrictions — road/bridge overrides blocked tiles
    if (blocked.has(KR) && !roadish) return { ok: false, why: "blocked" };

    // Boat requirement — bridge overrides; otherwise requires boat flag
    if (needBoat.has(KR) && !(onBridge(x, y) || actor?.boat)) return { ok: false, why: "need_boat" };

    // Biome impassable — road/bridge carve a pass
    const bio = biomeAt(x, y);
    if (IMPASSABLE.has(bio) && !roadish && !actor?.canClimb) return { ok: false, why: "too_steep" };

    return { ok: true, why: roadish ? "road_override" : "ok" };
  }

  function evaluateStep(actor, pos, dir, opts = {}) {
    const DIRS = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
    const d = DIRS[dir]; if (!d) return { ok:false, reason:"bad_dir" };
    const tx = pos.x + d[0], ty = pos.y + d[1];

    const gate = passable(tx, ty, actor, opts);
    if (!gate.ok) return { ok:false, reason: gate.why };

    // stamina cost: base 1; steep terrain 2; road halves cost
    let cost = 1;
    const bio = biomeAt(tx, ty);
    if (IMPASSABLE.has(bio)) cost = 2;
    if (onRoad(tx, ty) || onBridge(tx, ty)) cost = Math.max(1, Math.ceil(cost * 0.5));

    return { ok:true, to:{ x:tx, y:ty, biome: bio }, costs:{ sta: cost } };
  }

  return { evaluateStep };
}
