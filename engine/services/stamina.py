# server/services/stamina.py
"""
Stamina/Energy adapter
- Works with either player.stamina or player.energy (your Player exposes 'energy').
- Provides regen() and consume() with sane defaults if fields are missing.
"""

from time import time
from typing import Tuple

def _resolve_pool(player) -> Tuple[str, str, str, str]:
    """
    Return (current_name, max_name, updated_at_name, regen_rate_name)
    Prefers 'stamina*' fields; falls back to 'energy*'.
    """
    if hasattr(player, "stamina") or hasattr(player, "stamina_max"):
        prefix = "stamina"
    else:
        prefix = "energy"
    return (
        prefix,                     # current
        f"{prefix}_max",            # max
        f"{prefix}_updated_at",     # last regen timestamp (seconds)
        f"{prefix}_regen_per_min",  # per-minute regen rate
    )

def _ensure_defaults(player) -> Tuple[str, str, str, str]:
    cur, maxn, updn, regn = _resolve_pool(player)

    # set reasonable defaults if missing
    if not hasattr(player, maxn):
        setattr(player, maxn, int(getattr(player, cur, 100)) if hasattr(player, cur) else 100)
    if not hasattr(player, cur):
        setattr(player, cur, int(getattr(player, maxn)))
    if not hasattr(player, updn):
        setattr(player, updn, time())
    if not hasattr(player, regn):
        setattr(player, regn, 1)  # 1 per minute default

    return cur, maxn, updn, regn

def regen(player) -> None:
    """Regenerate the stamina/energy pool based on time elapsed."""
    cur, maxn, updn, regn = _ensure_defaults(player)

    now = time()
    last = getattr(player, updn)
    rate = float(getattr(player, regn) or 0.0)

    if rate <= 0:
        # still update timestamp to avoid huge catch-up later
        setattr(player, updn, now)
        return

    delta_min = max(0.0, (now - last) / 60.0)
    gain = int(delta_min * rate)

    if gain > 0:
        new_val = min(int(getattr(player, cur)) + gain, int(getattr(player, maxn)))
        setattr(player, cur, new_val)
        setattr(player, updn, now)

def consume(player, amount: int) -> bool:
    """
    Try to spend 'amount' from the pool.
    Returns True on success, False if not enough.
    """
    if amount <= 0:
        return True

    regen(player)

    cur, maxn, updn, regn = _ensure_defaults(player)
    current = int(getattr(player, cur))

    if current < amount:
        return False

    setattr(player, cur, current - amount)
    # update timestamp so regen math is consistent
    setattr(player, updn, time())
    return True
