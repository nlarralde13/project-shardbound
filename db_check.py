#!/usr/bin/env python3
"""
Quick schema fixer for Codex equipment migration on SQLite.

- Adds `combat_snapshot` column to the character table if missing
- Creates `character_equipped` table if missing
- Auto-detects singular/plural table names and PK column names
- (Optional) stamps Alembic to revision 43f9d88c2c2e and runs `flask db upgrade`

Usage (Windows CMD):
  py -3 tools\fix_equipment_schema.py --db app.db --stamp
or
  python tools\fix_equipment_schema.py --db app.db

Run from your project root (same folder as app.db).
"""
from __future__ import annotations
import argparse
import os
import sqlite3
import subprocess
import sys
from typing import Optional, Tuple

REVISION = "43f9d88c2c2e"  # character_equipped migration

# ------------------------- helpers -------------------------

def connect(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        print(f"[ERROR] DB not found: {db_path}")
        sys.exit(2)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys=ON")
    return con


def table_exists(con: sqlite3.Connection, name: str) -> bool:
    cur = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,))
    return cur.fetchone() is not None


def detect_table(con: sqlite3.Connection, candidates: list[str]) -> Optional[str]:
    for name in candidates:
        if table_exists(con, name):
            return name
    return None


def columns(con: sqlite3.Connection, table: str) -> list[Tuple[int,str,str,int,int,int]]:
    return list(con.execute(f"PRAGMA table_info('{table}')"))


def has_column(con: sqlite3.Connection, table: str, col: str) -> bool:
    return any(r[1] == col for r in columns(con, table))


def detect_pk(con: sqlite3.Connection, table: str, preferred: list[str]) -> Optional[str]:
    cols = columns(con, table)
    names = [c[1] for c in cols]
    for p in preferred:
        if p in names:
            return p
    # fallback: any column marked PK
    for cid, name, ctype, notnull, dflt, pk in cols:
        if pk:
            return name
    return None


def add_combat_snapshot(con: sqlite3.Connection, character_table: str) -> bool:
    if has_column(con, character_table, "combat_snapshot"):
        print(f"[OK] Column {character_table}.combat_snapshot already exists")
        return False
    # Use TEXT to be compatible with all SQLite builds
    con.execute(f"ALTER TABLE {character_table} ADD COLUMN combat_snapshot TEXT")
    print(f"[ADD] Column {character_table}.combat_snapshot TEXT added")
    return True


def create_character_equipped(
    con: sqlite3.Connection,
    character_table: str,
    character_pk: str,
    items_table: str,
    items_pk: str,
) -> bool:
    if table_exists(con, "character_equipped"):
        print("[OK] Table character_equipped already exists")
        return False

    sql = f"""
    CREATE TABLE IF NOT EXISTS character_equipped (
      id INTEGER PRIMARY KEY,
      character_id VARCHAR(64) NOT NULL,
      slot VARCHAR(32) NOT NULL,
      item_instance_id VARCHAR(64) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT uq_character_equipped_slot UNIQUE (character_id, slot),
      UNIQUE (item_instance_id),
      FOREIGN KEY(character_id) REFERENCES {character_table} ({character_pk}) ON DELETE CASCADE,
      FOREIGN KEY(item_instance_id) REFERENCES {items_table} ({items_pk})
    )
    """
    con.execute(sql)
    print("[ADD] Table character_equipped created")
    return True


def run_flask_cmd(args: list[str]) -> int:
    print("[FLASK]", " ".join(args))
    return subprocess.call(args, shell=False)

# ------------------------- main -------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="app.db", help="Path to SQLite DB (default: app.db)")
    parser.add_argument("--stamp", action="store_true", help="Run 'flask db stamp' and 'flask db upgrade' after fixing")
    ns = parser.parse_args()

    con = connect(ns.db)
    try:
        # Detect table names
        character_table = detect_table(con, ["character", "characters"]) or "character"
        items_table = detect_table(con, ["item_instances", "items_instances", "item_instance"]) or "item_instances"

        # Detect PK columns
        character_pk = detect_pk(con, character_table, ["character_id", "id"]) or "character_id"
        items_pk = detect_pk(con, items_table, ["instance_id", "id"]) or "instance_id"

        print(f"[INFO] Using FKs -> {character_table}({character_pk}), {items_table}({items_pk})")

        changed = False
        changed |= add_combat_snapshot(con, character_table)
        changed |= create_character_equipped(con, character_table, character_pk, items_table, items_pk)
        con.commit()
        print("[DONE] Schema check complete" + (" (changes applied)" if changed else " (no changes)"))

    finally:
        con.close()

    if ns.stamp:
        # Ensure env var to prevent accidental create_all during migrations
        env = os.environ.copy()
        env["AUTO_CREATE_TABLES"] = "0"
        rc = run_flask_cmd([sys.executable, "-m", "flask", "db", "stamp", REVISION])
        if rc != 0:
            sys.exit(rc)
        rc = run_flask_cmd([sys.executable, "-m", "flask", "db", "upgrade"])
        if rc != 0:
            sys.exit(rc)
        print("[OK] Alembic stamped and upgraded")

if __name__ == "__main__":
    main()
