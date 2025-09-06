"""
Shard Engine v2 - Deterministic Keyed RNG
-----------------------------------------

A simple, fast, *stateless* RNG interface for reproducible generation.

Design:
- All randomness is derived from: (seed: int, key: str, namespace: str)
- We hash these into a 64-bit integer using BLAKE2s, then map to [0,1) floats
- No global state; safe across threads and re-entrant calls
- Stable across Python versions (no reliance on random.Random internals)

Use:
    from api.shardEngine.rng import KeyedRNG, randf, randi, choice, sample, shuffle, value_noise2d

    rng = KeyedRNG(seed=12345678, namespace="v2.normal-16")
    p = rng.randf("river.source.0")
    n = rng.randi("poi.count", 2, 5)
    pick = rng.choice("biome.coast", ["coast", "beach", "marsh-lite"])
"""

from __future__ import annotations

import math
import hashlib
from typing import Iterable, List, Sequence, Tuple, TypeVar, Optional

T = TypeVar("T")


# -------- Core hashing --------------------------------------------------------

def _to_uint64(seed: int, key: str, namespace: str = "") -> int:
    """
    Produce a deterministic 64-bit unsigned int from seed+key+namespace.
    """
    h = hashlib.blake2s(digest_size=8)
    # Normalize everything to bytes. Seed as zero-padded 8-digit.
    h.update(f"{int(seed):08d}".encode("utf-8"))
    if namespace:
        h.update(b"|")
        h.update(namespace.encode("utf-8"))
    h.update(b"|")
    h.update(key.encode("utf-8"))
    # int.from_bytes(..., "big") yields 0..2**64-1
    return int.from_bytes(h.digest(), "big")


def _u64_to_unit_float(u: int) -> float:
    """
    Map 0..2**64-1 to [0, 1) with high uniformity.
    """
    # Divide by 2**64 to get [0,1). Avoid returning exactly 1.0.
    return (u & ((1 << 64) - 1)) / float(1 << 64)


# -------- Stateless helpers ---------------------------------------------------

def randf(seed: int, key: str, namespace: str = "") -> float:
    """Uniform float in [0,1)."""
    return _u64_to_unit_float(_to_uint64(seed, key, namespace))


def randi(seed: int, key: str, a: int, b: int, namespace: str = "") -> int:
    """Uniform integer in [a, b] inclusive."""
    if a > b:
        a, b = b, a
    u = _to_uint64(seed, key, namespace)
    span = (b - a + 1)
    return a + (u % span)


def choice(seed: int, key: str, seq: Sequence[T], namespace: str = "") -> T:
    """Pick one element from a non-empty sequence."""
    if not seq:
        raise ValueError("choice() on empty sequence")
    idx = randi(seed, key, 0, len(seq) - 1, namespace)
    return seq[idx]


def sample(seed: int, key: str, seq: Sequence[T], k: int, namespace: str = "") -> List[T]:
    """Sample k unique items without replacement (Fisher-Yates style)."""
    if k < 0:
        raise ValueError("k must be >= 0")
    k = min(k, len(seq))
    idxs = list(range(len(seq)))
    # Partial shuffle of first k positions
    for i in range(k):
        j = randi(seed, f"{key}.swap.{i}", i, len(idxs) - 1, namespace)
        idxs[i], idxs[j] = idxs[j], idxs[i]
    return [seq[i] for i in idxs[:k]]


def shuffle(seed: int, key: str, seq: Sequence[T], namespace: str = "") -> List[T]:
    """Return a shuffled copy of the sequence."""
    idxs = list(range(len(seq)))
    for i in range(len(idxs) - 1, 0, -1):
        j = randi(seed, f"{key}.swap.{i}", 0, i, namespace)
        idxs[i], idxs[j] = idxs[j], idxs[i]
    return [seq[i] for i in idxs]


def coinflip(seed: int, key: str, p: float = 0.5, namespace: str = "") -> bool:
    """Bernoulli(p)."""
    if not (0.0 <= p <= 1.0):
        raise ValueError("p must be in [0,1]")
    return randf(seed, key, namespace) < p


# -------- Spatial noise (grid-friendly) --------------------------------------

def value_noise2d(seed: int, key: str, x: int, y: int, namespace: str = "") -> float:
    """
    Deterministic value noise for grid coordinates (x,y) in [0,1).

    This is NOT Perlin/Simplex; it's a hash-based value noise good enough for:
    - resource potentials
    - desirability fields (poi)
    - lake/basin masks
    """
    u = _to_uint64(seed, f"{key}.{x}.{y}", namespace)
    return _u64_to_unit_float(u)


def value_noise2d_tiled(seed: int, key: str, x: int, y: int, period_x: int, period_y: int,
                        namespace: str = "") -> float:
    """
    Tiled variant for periodicity (wraps every period_x/period_y).
    """
    if period_x <= 0 or period_y <= 0:
        return value_noise2d(seed, key, x, y, namespace)
    xx = x % period_x
    yy = y % period_y
    return value_noise2d(seed, key, xx, yy, namespace)


def radial_falloff(cx: float, cy: float, x: float, y: float, radius: float) -> float:
    """
    Radial falloff [0,1] where 1.0 at center (cx,cy) and ~0 near radius edge.
    """
    if radius <= 0:
        return 0.0
    dx = x - cx
    dy = y - cy
    d = math.sqrt(dx * dx + dy * dy)
    t = max(0.0, 1.0 - (d / radius))
    # Smoothstep
    return t * t * (3 - 2 * t)


# -------- Stateful convenience wrapper ---------------------------------------

class KeyedRNG:
    """
    Convenience wrapper that carries (seed, namespace) so you only pass keys.

    Example:
        rng = KeyedRNG(12345678, "v2.normal-16")
        f = rng.randf("river.source.0")
        i = rng.randi("poi.count", 1, 4)
        pick = rng.choice("coast.biome", ["coast","beach","marsh-lite"])
        n = rng.value_noise2d("resources.ore", x, y)
    """
    __slots__ = ("seed", "namespace")

    def __init__(self, seed: int, namespace: str = ""):
        self.seed = int(seed)
        self.namespace = namespace or ""

    # Basic draws
    def randf(self, key: str) -> float:
        return randf(self.seed, key, self.namespace)

    def randi(self, key: str, a: int, b: int) -> int:
        return randi(self.seed, key, a, b, self.namespace)

    def choice(self, key: str, seq: Sequence[T]) -> T:
        return choice(self.seed, key, seq, self.namespace)

    def sample(self, key: str, seq: Sequence[T], k: int) -> List[T]:
        return sample(self.seed, key, seq, k, self.namespace)

    def shuffle(self, key: str, seq: Sequence[T]) -> List[T]:
        return shuffle(self.seed, key, seq, self.namespace)

    def coinflip(self, key: str, p: float = 0.5) -> bool:
        return coinflip(self.seed, key, p, self.namespace)

    # Spatial noise
    def value_noise2d(self, key: str, x: int, y: int) -> float:
        return value_noise2d(self.seed, key, x, y, self.namespace)

    def value_noise2d_tiled(self, key: str, x: int, y: int, period_x: int, period_y: int) -> float:
        return value_noise2d_tiled(self.seed, key, x, y, period_x, period_y, self.namespace)

    # Namespacing helpers
    def with_namespace(self, extra: str) -> "KeyedRNG":
        ns = f"{self.namespace}.{extra}" if self.namespace else extra
        return KeyedRNG(self.seed, ns)
