// rng.js — deterministic RNG toolkit for ProjectMMO (ESM, 32-bit safe)
//
// Highlights
// - mulberry32 (default): tiny, fast, good quality for procgen
// - xoshiro128** (optional): stronger quality, 128-bit state
// - seed hashing & domain separation: hash2, fnv1a, hashCombine, derive
// - RNG class with helpers: int(), floatIn(), pick(), pickWeighted(), shuffleInPlace(), sample()
// - Distributions: gaussian(), poisson(), binomial(), exp()
// - Grid helpers: hash2D(), noise2D() for slice/room generation
//
// All ops are 32-bit integer math → stable across browsers.

export const UINT32_MAX = 0x100000000 >>> 0;
const FNV_OFFSET = 0x811C9DC5 >>> 0;
const FNV_PRIME  = 0x01000193 >>> 0;

// -----------------------------
// Hashing / Seeding utilities
// -----------------------------

/** FNV-1a 32-bit of a string (stable across platforms) */
export function fnv1a(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Mix numbers/strings into one 32-bit seed */
export function hashCombine(...parts) {
  let h = FNV_OFFSET;
  for (const p of parts) {
    let x;
    if (typeof p === 'number') {
      x = (p >>> 0);
    } else if (typeof p === 'string') {
      x = fnv1a(p);
    } else if (p != null && typeof p.toString === 'function') {
      x = fnv1a(String(p));
    } else {
      x = 0;
    }
    h = Math.imul(h ^ x, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic tile seed from (worldSeed, shardID, x, y) */
export function hash2(worldSeed, shardID, x, y) {
  let h = (FNV_OFFSET ^ (worldSeed >>> 0)) >>> 0;
  for (let i = 0; i < shardID.length; i++) {
    h = Math.imul(h ^ shardID.charCodeAt(i), 16777619) >>> 0;
  }
  h = Math.imul(h ^ (x * 73856093 >>> 0), 16777619) >>> 0;
  h = Math.imul(h ^ (y * 19349663 >>> 0), 16777619) >>> 0;
  return h >>> 0;
}

/** Domain separation: derive a new seed from base + label */
export function derive(seed, label) {
  let h = (FNV_OFFSET ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

/** splitmix32: generate new 32-bit seeds from a base */
export function splitmix32SeedStream(baseSeed) {
  let s = baseSeed >>> 0;
  return function nextSeed() {
    s = (s + 0x9E3779B9) >>> 0;
    let z = s;
    z = (z ^ (z >>> 16)) >>> 0;
    z = Math.imul(z, 0x85EBCA6B) >>> 0;
    z = (z ^ (z >>> 13)) >>> 0;
    z = Math.imul(z, 0xC2B2AE35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z >>> 0;
  };
}

// -----------------------------
// PRNG cores
// -----------------------------

/** mulberry32 core: returns {state, uint32} given current state */
function mulberry32_next(state) {
  state = (state + 0x6D2B79F5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const uint = ((t ^ (t >>> 14)) >>> 0);
  return { state, uint };
}

/** xoshiro128** core; state = Uint32Array(4) */
function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
function xoshiro128ss_next(stateArr) {
  const s0 = stateArr[0] >>> 0;
  const s1 = stateArr[1] >>> 0;
  const s2 = stateArr[2] >>> 0;
  const s3 = stateArr[3] >>> 0;

  const result = Math.imul(rotl((Math.imul(s1, 5) >>> 0), 7), 9) >>> 0;

  const t = (s1 << 9) >>> 0;
  stateArr[2] = (s2 ^ s0) >>> 0;
  stateArr[3] = (s3 ^ s1) >>> 0;
  stateArr[1] = (s1 ^ stateArr[2]) >>> 0;
  stateArr[0] = (s0 ^ stateArr[3]) >>> 0;
  stateArr[2] = (stateArr[2] ^ t) >>> 0;
  stateArr[3] = rotl(stateArr[3], 11);

  return result >>> 0;
}

/** Convenience constructors returning a float() function [0,1) */
export function mulberry32(seed) {
  let st = seed >>> 0;
  return function() {
    const r = mulberry32_next(st);
    st = r.state;
    return r.uint / UINT32_MAX;
  };
}

export function xoshiro128ss(seed) {
  // Seed xoshiro state via splitmix32
  const next = splitmix32SeedStream(seed >>> 0);
  const state = new Uint32Array([next(), next(), next(), next()]);
  return function() {
    return xoshiro128ss_next(state) / UINT32_MAX;
  };
}

// -----------------------------
// RNG class (high-level API)
// -----------------------------

export class RNG {
  /**
   * @param {number|string|Array<number|string>} seedOrParts
   * @param {'mulberry32'|'xoshiro128ss'} algo
   */
  constructor(seedOrParts = 0xDEADBEEF, algo = 'mulberry32') {
    const seed = Array.isArray(seedOrParts)
      ? hashCombine(...seedOrParts)
      : (typeof seedOrParts === 'string' ? fnv1a(seedOrParts) : (seedOrParts >>> 0));

    this.algo = algo;
    this._gaussCache = null;

    if (algo === 'xoshiro128ss') {
      const sm = splitmix32SeedStream(seed);
      this._state = new Uint32Array([sm(), sm(), sm(), sm()]);
      this._nextUint32 = () => xoshiro128ss_next(this._state);
      // Save/restore: copy the 4-word state
      this.saveState = () => new Uint32Array(this._state);
      this.restoreState = (arr) => { this._state.set(arr); };
    } else {
      // default: mulberry32 (single 32-bit state)
      this._state = seed >>> 0;
      this._nextUint32 = () => {
        const r = mulberry32_next(this._state);
        this._state = r.state >>> 0;
        return r.uint >>> 0;
      };
      this.saveState = () => this._state >>> 0;
      this.restoreState = (s) => { this._state = (s >>> 0); };
    }
  }

  /** Uint32 in [0, 2^32) */
  nextUint32() { return this._nextUint32(); }

  /** Float in [0,1) */
  float() { return this._nextUint32() / UINT32_MAX; }

  /** Float in [min, max) */
  floatIn(min, max) { return min + (max - min) * this.float(); }

  /** Integer in [min, maxExclusive) */
  int(min, maxExclusive) {
    return (Math.floor(this.float() * (maxExclusive - min)) + min) | 0;
  }

  /** Boolean with probability p (0..1) */
  bool(p = 0.5) { return this.float() < p; }
  chance(p) { return this.bool(p); }

  /** Pick 1 element uniformly */
  pick(arr) { return arr[this.int(0, arr.length)]; }

  /** Fisher–Yates shuffle (in place) */
  shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Sample k items (without replacement by default) */
  sample(arr, k, { replace = false } = {}) {
    if (replace) {
      const out = new Array(k);
      for (let i = 0; i < k; i++) out[i] = this.pick(arr);
      return out;
    }
    const copy = arr.slice();
    this.shuffleInPlace(copy);
    return copy.slice(0, k);
  }

  /**
   * Weighted pick: items can be
   *   - {item, w} objects, or
   *   - [item, weight] tuples, or
   *   - plain numbers as weights with parallel values array
   */
  pickWeighted(items, values) {
    let pairs;
    if (Array.isArray(items) && values && Array.isArray(values)) {
      pairs = items.map((item, i) => ({ item, w: values[i] }));
    } else {
      pairs = items.map(it => Array.isArray(it) ? ({ item: it[0], w: it[1] })
                                                : (typeof it === 'object' ? it : ({ item: it, w: 1 })));
    }
    let total = 0;
    for (const p of pairs) total += +p.w || 0;
    let r = this.float() * total;
    for (const p of pairs) { r -= +p.w || 0; if (r <= 0) return p.item; }
    return pairs[pairs.length - 1].item;
  }

  // ---------------- Distributions ----------------

  /** Standard normal via Box–Muller (with 1-value cache) */
  gaussian(mean = 0, std = 1) {
    if (this._gaussCache != null) {
      const z = this._gaussCache; this._gaussCache = null;
      return mean + std * z;
    }
    let u = 0, v = 0;
    while (u === 0) u = this.float();
    while (v === 0) v = this.float();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    const z1 = mag * Math.sin(2 * Math.PI * v);
    this._gaussCache = z1;
    return mean + std * z0;
  }

  /** Exponential(lambda) waiting time */
  exp(lambda = 1) {
    let u = this.float();
    while (u <= 0) u = this.float();
    return -Math.log(u) / lambda;
  }

  /** Poisson(lambda) using Knuth for small λ, or normal approx for large λ */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= this.float(); } while (p > L);
      return k - 1;
    }
    // normal approximation
    const mean = lambda, std = Math.sqrt(lambda);
    return Math.max(0, Math.round(this.gaussian(mean, std)));
  }

  /** Binomial(n, p) via poisson or normal approximations if large */
  binomial(n, p) {
    if (n <= 0) return 0;
    if (n * p < 30) { // direct Bernoulli sum ok
      let k = 0;
      for (let i = 0; i < n; i++) if (this.float() < p) k++;
      return k;
    }
    const mean = n * p, std = Math.sqrt(n * p * (1 - p));
    return Math.max(0, Math.min(n, Math.round(this.gaussian(mean, std))));
  }

  // -------------- Streams & state --------------

  /** Derive a new RNG from this one using a label (domain separation) */
  derive(label, algo = this.algo) {
    return new RNG(derive(this.peekSeed(), label), algo);
  }

  /** Fork N independent RNGs via splitmix32 seeds */
  fork(count = 1, algo = this.algo) {
    const sm = splitmix32SeedStream(this.peekSeed());
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(new RNG(sm(), algo));
    return arr;
  }

  /** Advance the generator n steps (O(n), fine for small n) */
  skip(n) { for (let i = 0; i < n; i++) this._nextUint32(); return this; }

  /** Return current seed-ish snapshot for reproducibility */
  peekSeed() {
    if (this.algo === 'xoshiro128ss') {
      // compress 4-word state into one 32-bit via hashCombine
      const s = this.saveState();
      return hashCombine(s[0], s[1], s[2], s[3]);
    }
    return this.saveState() >>> 0;
  }
}

// -----------------------------
// Grid / noise helpers
// -----------------------------

/** Hash 2D integer coords to a float [0,1) using a base seed */
export function hash2D(x, y, baseSeed = 0) {
  const h = hashCombine(baseSeed, x|0, (y|0) ^ 0x9E3779B9);
  // Mulberry step to diffuse then map to [0,1)
  return (mulberry32_next(h).uint) / UINT32_MAX;
}

/** Smooth-ish value noise (bilinear) on integer lattice */
export function noise2D(x, y, baseSeed = 0, freq = 1) {
  const xf = x * freq, yf = y * freq;
  const x0 = Math.floor(xf), y0 = Math.floor(yf);
  const tx = xf - x0, ty = yf - y0;

  const v00 = hash2D(x0,     y0,     baseSeed);
  const v10 = hash2D(x0 + 1, y0,     baseSeed);
  const v01 = hash2D(x0,     y0 + 1, baseSeed);
  const v11 = hash2D(x0 + 1, y0 + 1, baseSeed);

  // smoothstep curve for nicer transitions
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const ix0 = v00 * (1 - sx) + v10 * sx;
  const ix1 = v01 * (1 - sx) + v11 * sx;
  return ix0 * (1 - sy) + ix1 * sy;
}

// -----------------------------
// Convenience statics (functional style)
// -----------------------------

export function chance(rng, p)       { return rng.float() < p; }
export function intRange(rng, a, b)  { return (Math.floor(rng.float() * (b - a)) + a) | 0; }
export function floatRange(rng, a, b){ return a + (b - a) * rng.float(); }
export function pick(rng, arr)       { return arr[intRange(rng, 0, arr.length)]; }
export function pickWeighted(rng, items, values) { return new RNG(rng.peekSeed(), rng.algo).pickWeighted(items, values); }
export function shuffleInPlace(rng, arr) { return new RNG(rng.peekSeed(), rng.algo).shuffleInPlace(arr); }
export function sample(rng, arr, k, opts) { return new RNG(rng.peekSeed(), rng.algo).sample(arr, k, opts); }

// -----------------------------
// Quick presets
// -----------------------------

/** Make a tile RNG with separated substreams for stability */
export function makeTileRNG(worldSeed, shardID, x, y, algo = 'mulberry32') {
  const base = hash2(worldSeed, shardID, x, y);
  const root = new RNG(base, algo);
  return {
    base: root,
    mobs: root.derive('mobs', algo),
    resources: root.derive('resources', algo),
    layout: root.derive('layout', algo),
    loot: root.derive('loot', algo),
  };
}
