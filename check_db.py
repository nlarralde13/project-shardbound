# check_db.py
import os, sys, sqlite3, json

def find_sqlite_path_from_flask():
    """Try to import your Flask app and read SQLALCHEMY_DATABASE_URI."""
    try:
        # ensure local package import works when running directly
        sys.path.insert(0, os.path.abspath("."))
        from api import create_app
        a = create_app()
        uri = a.config.get("SQLALCHEMY_DATABASE_URI", "")
        print("Flask SQLALCHEMY_DATABASE_URI:", uri)
        if uri.startswith("sqlite:///"):
            # typical form: sqlite:///C:\path\to\app.db  (Windows)
            return uri.replace("sqlite:///", "", 1)
        elif uri.startswith("sqlite://"):
            # edge cases like sqlite:// (not expected here)
            return None
        else:
            # Not SQLite (e.g., Postgres); bail to manual check
            return None
    except Exception as e:
        print("Could not import api.create_app (that's OK):", repr(e))
        return None

def first_existing(paths):
    for p in paths:
        if p and os.path.exists(p):
            return p
    return None

def column_names(cur, table):
    try:
        return [r[1] for r in cur.execute(f"PRAGMA table_info({table})")]
    except sqlite3.DatabaseError:
        return []

def safe_select_some(cur, table, cols, limit=5):
    cols = [c for c in cols if c in column_names(cur, table)]
    if not cols:
        return []
    q = f"SELECT {', '.join(cols)} FROM {table} LIMIT {limit}"
    try:
        return [dict(zip(cols, row)) for row in cur.execute(q)]
    except sqlite3.DatabaseError:
        return []

def main():
    # 1) figure out DB path
    guess_from_flask = find_sqlite_path_from_flask()
    fallback_paths = [
        guess_from_flask,
        os.path.join("app.db"),
        os.path.join("api", "app.db"),
    ]
    db_path = first_existing(fallback_paths)
    print("Resolved DB path:", db_path if db_path else "(not found)")

    if not db_path:
        print("❌ Could not find a SQLite file. Is the DB created yet?")
        sys.exit(2)

    # 2) connect and inspect
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # alembic version
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print("Tables:", tables)

    if "alembic_version" in tables:
        ver = list(cur.execute("SELECT version_num FROM alembic_version"))
        print("Alembic version table:", ver)
    else:
        print("Alembic version table: (missing)")

    # character columns
    cols = column_names(cur, "character")
    print("Character columns:", cols)

    # sample character rows (show key fields when present)
    wanted = ["character_id", "name", "first_time_spawn", "last_coords", "x", "y", "cur_loc", "created_at"]
    sample = safe_select_some(cur, "character", wanted, limit=5)

    def parse_xy_field(v):
        if v is None:
            return None
        if isinstance(v, (bytes, bytearray)):
            v = v.decode("utf-8", "ignore")
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("{"):
                try:
                    o = json.loads(s)
                    return f"({o.get('x')},{o.get('y')})"
                except Exception:
                    return s
            if "," in s:
                return f"({s})"
        if isinstance(v, dict):
            return f"({v.get('x')},{v.get('y')})"
        return str(v)

    if sample:
        print("\nFirst few character rows (key fields):")
        for row in sample:
            fx = parse_xy_field(row.get("first_time_spawn"))
            lx = parse_xy_field(row.get("last_coords"))
            xy = None
            if "x" in row and "y" in row and row.get("x") is not None and row.get("y") is not None:
                xy = f"({row.get('x')},{row.get('y')})"
            cl = row.get("cur_loc")
            print(f" - {row.get('character_id')}  name={row.get('name')}  spawn={fx}  last={lx}  x/y={xy}  cur_loc={cl}")
    else:
        print("\nNo character rows (yet). Create one via /api/game/characters to test spawn/restore.")

    con.close()

if __name__ == "__main__":
    main()
