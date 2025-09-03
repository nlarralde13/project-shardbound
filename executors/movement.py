"""Movement command executors (stub)."""
from __future__ import annotations
from typing import Any, Dict, List


def move(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Stub movement command.

    Returns a simple text frame indicating movement north. In a full
    implementation this would update character position based on ``cmd`` and
    ``ctx``.
    """
    return [{"type": "text", "data": "You move north."}]
