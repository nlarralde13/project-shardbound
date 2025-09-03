"""Inventory command executors (stub)."""
from __future__ import annotations
from typing import Any, Dict, List


def inv(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return a sample inventory table frame."""
    data = [
        {"item": "Health Potion", "qty": 2},
        {"item": "Iron Sword", "qty": 1},
    ]
    return [{"type": "table", "data": data}]
