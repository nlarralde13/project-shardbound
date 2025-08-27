"""Simple SQLite-backed persistence for room state."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from pathlib import Path


# Path to the sqlite database storing room state
DB_PATH = Path(__file__).with_name("rooms.db")


def _get_conn() -> sqlite3.Connection:
    """Create a connection and ensure the schema exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rooms (
            world_id TEXT,
            x INTEGER,
            y INTEGER,
            data TEXT,
            PRIMARY KEY(world_id, x, y)
        )
        """
    )
    return conn


def load_room(world_id: str, x: int, y: int):
    """Load a room from the database. Returns None if not present."""
    conn = _get_conn()
    cur = conn.execute(
        "SELECT data FROM rooms WHERE world_id=? AND x=? AND y=?",
        (world_id, int(x), int(y)),
    )
    row = cur.fetchone()
    conn.close()
    if row is None:
        return None
    data = json.loads(row[0])
    from .world_loader import Room  # local import to avoid circular dependency

    return Room(**data)


def save_room(room) -> None:
    """Persist a room to the database."""
    conn = _get_conn()
    data = json.dumps(asdict(room))
    conn.execute(
        "INSERT OR REPLACE INTO rooms(world_id, x, y, data) VALUES (?,?,?,?)",
        (room.world_id, room.x, room.y, data),
    )
    conn.commit()
    conn.close()

