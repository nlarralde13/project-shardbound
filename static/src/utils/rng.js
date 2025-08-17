// Deterministic RNG seeded by a combined key per spec.
// Uses cyrb128 + sfc32 for stable, fast float PRNG.
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2)>>>0, (h3^h4)>>>0, (h1^h3)>>>0, (h2^h4)>>>0];
}
function sfc32(a,b,c,d){
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}
export function rngFrom({ worldSeed, shardId, tileX, tileY, roomX=null, roomY=null, playerId, systemTag }) {
  const parts = [
    `w:${worldSeed}`, `s:${shardId}`, `tx:${tileX}`, `ty:${tileY}`,
    roomX==null?"" : `rx:${roomX}`, roomY==null?"" : `ry:${roomY}`,
    `p:${playerId}`, `tag:${systemTag}`
  ].join("|");
  const [a,b,c,d] = cyrb128(parts);
  const rand = sfc32(a,b,c,d);
  return {
    float: () => rand(),
    int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(rand()*arr.length)]
  };
}
