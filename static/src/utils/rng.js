// Deterministic RNG helpers (xmur3 hash → mulberry32 PRNG)
// Seed with any string; stable across sessions.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRNG(...parts) {
  const seedStr = parts.map(String).join('|');
  const seedFn = xmur3(seedStr);
  const rnd = mulberry32(seedFn());
  return {
    random: () => rnd(),
    int: (min, max) => Math.floor(rnd() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rnd() * arr.length)],
    pickWeighted(weights) {
      // weights: [{id, weight}]
      const total = weights.reduce((s, w) => s + w.weight, 0);
      let r = rnd() * total;
      for (const w of weights) {
        if ((r -= w.weight) <= 0) return w.id;
      }
      return weights[weights.length - 1].id;
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
