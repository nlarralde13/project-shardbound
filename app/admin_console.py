"""Simple admin console command registry."""
from __future__ import annotations

import argparse
import shlex
from typing import Callable, Dict, Tuple, Any

from .security_rbac import audit, has_scope, role_gte, get_user_from_session
from .models import Character, Town, db


COMMANDS: Dict[str, Dict[str, Any]] = {}


def command(name: str, scope: str | None = None, min_role: str = "moderator"):
    def deco(fn: Callable[[list[str]], Tuple[str, dict | None]]):
        COMMANDS[name] = {"fn": fn, "scope": scope, "min_role": min_role}
        return fn

    return deco


@command("help")
def cmd_help(args: list[str]):
    return "Commands:\n" + "\n".join(sorted(COMMANDS.keys())), None


@command("char:move", scope="char.move", min_role="gm")
def cmd_char_move(argv: list[str]):
    parser = argparse.ArgumentParser(prog="char:move", add_help=False)
    parser.add_argument("character_id")
    parser.add_argument("--x", type=int)
    parser.add_argument("--y", type=int)
    parser.add_argument("--note")
    parser.add_argument("--snap-to-spawn", action="store_true")
    parser.add_argument("--town")
    ns = parser.parse_args(argv)

    ch = db.session.get(Character, ns.character_id)
    if not ch:
        return "character not found", None

    if ns.snap_to_spawn and ch.first_time_spawn:
        coords = ch.first_time_spawn
    elif ns.town:
        town = db.session.get(Town, ns.town)
        if not town:
            return "town not found", None
        coords = {"x": town.x + town.width // 2, "y": town.y + town.height // 2}
    else:
        if ns.x is None or ns.y is None:
            return "x and y required", None
        coords = {"x": ns.x, "y": ns.y}

    ch.last_coords = coords
    ch.cur_loc = f"{coords['x']},{coords['y']}"
    db.session.commit()

    audit("char.teleport", "character", ch.character_id, payload={"coords": coords, "note": ns.note})

    return f"moved {ch.character_id} to ({coords['x']},{coords['y']})", {"character_id": ch.character_id, "coords": coords}


def dispatch(cmdline: str, dry_run: bool = False):
    if not cmdline:
        return "empty command", None, 400
    parts = shlex.split(cmdline)
    name, argv = parts[0], parts[1:]
    entry = COMMANDS.get(name)
    if not entry:
        return f"unknown command '{name}'", None, 400

    u = get_user_from_session()
    if not u or not role_gte(getattr(u, "role", "user"), entry["min_role"]):
        return "forbidden", None, 403
    if entry["scope"] and not has_scope(u, entry["scope"]):
        return "forbidden", None, 403

    if dry_run:
        return f"[dry-run] {name} OK", {"dry_run": True}, 200

    out, data = entry["fn"](argv)
    return out, data or {}, 200

