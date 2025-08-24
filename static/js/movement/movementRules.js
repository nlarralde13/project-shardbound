// movementRules.js
// Central rules engine for "can I move from A to B?" with cost + reason codes.
// Pure functions; no DOM access.

export function createMovementRules(shard) {
  const index = buildMovementIndex(shard);
  const cfg = defaultConfig();

  return {
    config: cfg,
    evaluateStep: (actor, fromPos, dir, opts = {}) =>
      evaluateStep(index, shard, cfg, actor, fromPos, dir, opts),
  };
}

export function defaultConfig() {
  return {
    elevation: {
      enabled: true,
      maxDelta: 6, // block if |Δelev| > maxDelta unless actor.canClimb
    },
    stamina: {
      enabled: true,
      base: 1,
      biomeCosts: {
        'marsh-lite': 2,
        hills: 2,
        mountains: 3,
      },
      roadCost: 0, // if stepping onto a road tile
      minSTAtoMove: 1, // require at least this much STA to begin the step
    },
    rivers: {
      blockWithoutBridge: true,
    },
    diagonals: {
      enabled: false, // set true if you later want 8-way
    },
  };
}

function buildCoordKey(x, y) {
  return `${x},${y}`;
}

function setFromPairs(pairs) {
  const s = new Set();
  for (const p of pairs || []) {
    if (Array.isArray(p) && p.length >= 2) s.add(buildCoordKey(p[0], p[1]));
  }
  return s;
}

function flattenPolylines(polylines) {
  const s = new Set();
  for (const line of polylines || []) {
    for (const p of line || []) {
      if (Array.isArray(p) && p.length >= 2) s.add(buildCoordKey(p[0], p[1]));
    }
  }
  return s;
}

function collectRoadPoints(paths) {
  // roads.paths: [ [ [x,y], [x,y], ... ], ... ]
  return flattenPolylines(paths);
}

function buildMovementIndex(shard) {
  const blockedLand = setFromPairs(
    shard?.layers?.movement?.blocked_for?.land || []
  );
  const boatReq = setFromPairs(
    shard?.layers?.movement?.requires?.boat || []
  );

  const riverCells = flattenPolylines(shard?.layers?.hydrology?.rivers || []);
  // bridges schema is undefined here; we’ll assume an array of {x,y} or [x,y]
  const bridgesRaw = shard?.layers?.roads?.bridges || [];
  const bridgeCells = new Set();
  for (const b of bridgesRaw) {
    if (Array.isArray(b) && b.length >= 2) {
      bridgeCells.add(buildCoordKey(b[0], b[1]));
    } else if (b && typeof b.x === 'number' && typeof b.y === 'number') {
      bridgeCells.add(buildCoordKey(b.x, b.y));
    }
  }

  const roadCells = collectRoadPoints(shard?.layers?.roads?.paths || []);

  return {
    blockedLand,
    boatReq,
    riverCells,
    bridgeCells,
    roadCells,
  };
}

function biomeAt(shard, x, y) {
  const w = shard?.size?.[0] ?? shard?.meta?.width ?? shard?.grid?.[0]?.length ?? 0;
  const h = shard?.size?.[1] ?? shard?.meta?.height ?? shard?.grid?.length ?? 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  return shard?.grid?.[y]?.[x] ?? null;
}

function elevationAt(shard, x, y) {
  const e = shard?.layers?.elevation;
  if (!Array.isArray(e) || !Array.isArray(e[0])) return null;
  return e?.[y]?.[x] ?? null;
}

function dirToDelta(dir) {
  switch (dir) {
    case 'N': return [0, -1];
    case 'S': return [0, 1];
    case 'E': return [1, 0];
    case 'W': return [-1, 0];
    case 'NE': return [1, -1];
    case 'NW': return [-1, -1];
    case 'SE': return [1, 1];
    case 'SW': return [-1, 1];
    default: return [0, 0];
  }
}

export function evaluateStep(index, shard, cfg, actor, fromPos, dir, opts = {}) {
  const { devMode = false, noclip = false } = opts;
  const [dx, dy] = dirToDelta(dir);
  const W = shard?.size?.[0] ?? 0;
  const H = shard?.size?.[1] ?? 0;

  const toX = clamp(fromPos.x + dx, 0, W - 1);
  const toY = clamp(fromPos.y + dy, 0, H - 1);

  const toKey = buildCoordKey(toX, toY);
  const fromKey = buildCoordKey(fromPos.x, fromPos.y);

  // If noclip in devmode: allow everything (but still clamp to bounds)
  if (devMode && noclip) {
    return {
      ok: !(toX === fromPos.x && toY === fromPos.y),
      reason: null,
      costs: { sta: 0 },
      to: { x: toX, y: toY, biome: biomeAt(shard, toX, toY) },
      tags: new Set(['noclip']),
    };
  }

  // Hard block: blocked_for.land
  if (index.blockedLand.has(toKey)) {
    return deny('That way is blocked.');
  }

  const toBiome = biomeAt(shard, toX, toY);

  // Boat requirements: movement layer first
  const boatNeeded = index.boatReq.has(toKey) || toBiome === 'ocean';
  if (boatNeeded && !actor?.boat) {
    return deny('You need a boat to traverse these waters.');
  }

  // Rivers require bridges (if enabled)
  if (cfg.rivers.blockWithoutBridge && index.riverCells.has(toKey)) {
    if (!index.bridgeCells.has(toKey)) {
      return deny('The river blocks your path here. Look for a bridge.');
    }
  }

  // Elevation gate
  if (cfg.elevation.enabled) {
    const eFrom = elevationAt(shard, fromPos.x, fromPos.y);
    const eTo = elevationAt(shard, toX, toY);
    if (typeof eFrom === 'number' && typeof eTo === 'number') {
      const dE = Math.abs(eTo - eFrom);
      if (dE > cfg.elevation.maxDelta && !actor?.canClimb) {
        return deny('Too steep to climb.');
      }
    }
  }

  // Stamina cost
  let staCost = 0;
  if (cfg.stamina.enabled) {
    staCost = cfg.stamina.base;
    // Road discount if stepping ONTO a road tile
    if (index.roadCells.has(toKey)) staCost = Math.min(staCost, cfg.stamina.roadCost);

    // Biome surcharges
    const bc = cfg.stamina.biomeCosts?.[toBiome];
    if (typeof bc === 'number') staCost = Math.max(staCost, bc);

    // Require minimum STA to move at all
    if ((actor?.sta ?? 0) < Math.max(1, cfg.stamina.minSTAtoMove)) {
      return deny('You are too exhausted to move.');
    }
    if ((actor?.sta ?? 0) < staCost) {
      return deny('Not enough stamina for that terrain.');
    }
  }

  return {
    ok: !(toX === fromPos.x && toY === fromPos.y),
    reason: null,
    costs: { sta: staCost },
    to: { x: toX, y: toY, biome: toBiome },
    tags: new Set([
      index.roadCells.has(toKey) ? 'road' : '',
      boatNeeded ? 'boat-zone' : '',
    ].filter(Boolean)),
  };
}

function deny(reason) {
  return { ok: false, reason, costs: { sta: 0 }, to: null, tags: new Set() };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
