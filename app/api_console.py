"""Lightweight console execution API.

Provides a single POST `/api/console/exec` endpoint that echoes back
input lines and stubs out basic commands.  Intended for early console UI
experiments.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from executors.movement import move_command, DIRS as MOVE_DIRS
from executors.look import look as exec_look, where as exec_where

bp = Blueprint("api_console", __name__, url_prefix="/api/console")

# in-memory per-user rate limiting; not persistent and only suitable for
# low traffic testing purposes
_RATE_LIMIT: defaultdict[str, Deque[float]] = defaultdict(deque)
_MAX_PER_SEC = 5
_WINDOW = 1.0  # seconds


@bp.post("/exec")
@login_required
def exec_command():
    """Execute a console command.

    Input JSON: ``{"line": str, "context": {"character_id": str?, "shard_id": str?}}``
    Output JSON: ``{"status": "ok"|"error", "frames": [{"type", "data"}], "error": {"message", "code"}}``
    """
    data = request.get_json(force=True, silent=True) or {}
    line = data.get("line")
    if line is None or not isinstance(line, str):
        line = ""
    line = line.strip()

    if len(line) > 512:
        return (
            jsonify(
                {
                    "status": "error",
                    "frames": [],
                    "error": {"message": "Line too long", "code": "line_too_long"},
                }
            ),
            400,
        )

    # simple per-user rate limiting (5 requests per second window)
    user_id = str(current_user.get_id())
    now = time.monotonic()
    q = _RATE_LIMIT[user_id]
    while q and now - q[0] > _WINDOW:
        q.popleft()
    if len(q) >= _MAX_PER_SEC:
        return (
            jsonify(
                {
                    "status": "error",
                    "frames": [],
                    "error": {"message": "Rate limit exceeded", "code": "rate_limit"},
                }
            ),
            429,
        )
    q.append(now)

    frames = [{"type": "text", "data": line}]
    cmd = line.lower()
    if cmd in MOVE_DIRS:
        frames.extend(move_command(cmd))
    elif cmd in ("look", "l"):
        frames.extend(exec_look())
    elif cmd == "where":
        frames.extend(exec_where())

    return jsonify({"status": "ok", "frames": frames})
