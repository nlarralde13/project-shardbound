"""Simple command router for console commands.

Provides a lightweight registry for server-side console commands and a
``route`` helper that parses a line of text and executes the resolved command.

This mirrors the lightweight command registry used on the front-end.  The
implementation here is intentionally small and will be expanded later.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
import shlex

CommandExec = Callable[[Dict[str, Any], Dict[str, Any]], List[Dict[str, Any]]]

MAX_LINE_LEN = 512

@dataclass
class CommandDef:
    name: str
    exec: CommandExec
    aliases: Optional[List[str]] = None
    description: str | None = None
    usage: str | None = None
    examples: Optional[List[str]] = None


_commands: Dict[str, CommandDef] = {}
_aliases: Dict[str, str] = {}


def register(cmd_def: Dict[str, Any] | CommandDef) -> CommandDef:
    """Register a command definition."""
    if isinstance(cmd_def, dict):
        cmd_def = CommandDef(**cmd_def)
    if not cmd_def.name:
        return cmd_def
    _commands[cmd_def.name] = cmd_def
    for a in cmd_def.aliases or []:
        _aliases[a] = cmd_def.name
    return cmd_def


def get(name: str) -> Optional[CommandDef]:
    """Get a command definition by name (canonical only)."""
    if not name:
        return None
    return _commands.get(name)


def resolve(name_or_alias: str) -> Optional[CommandDef]:
    """Resolve a command name or alias to its definition."""
    if not name_or_alias:
        return None
    name = _aliases.get(name_or_alias, name_or_alias)
    return get(name)


def route(line: str, user: Any, character: Any, db: Any) -> List[Dict[str, Any]]:
    """Parse ``line`` and execute the resolved command.

    Parameters mirror the front-end schema.  ``user`` and ``character`` are
    passed through to executor functions via a simple context dict.
    """
    if not isinstance(line, str):
        return [{"type": "text", "data": "Invalid input"}]
    if len(line) > MAX_LINE_LEN:
        return [{"type": "text", "data": "Line too long"}]
    try:
        parts = shlex.split(line)
    except ValueError as e:
        return [{"type": "text", "data": str(e)}]
    if not parts:
        return []
    token, *args = parts
    cmd_def = resolve(token)
    if not cmd_def:
        return [{"type": "text", "data": f"Unknown command: {token}"}]
    ctx = {"user": user, "character": character, "db": db}
    cmd = {"cmd": cmd_def.name, "args": args, "flags": {}}
    try:
        frames = cmd_def.exec(cmd, ctx)
    except Exception as e:  # pragma: no cover - simple safety
        return [{"type": "text", "data": f"Error: {e}"}]
    return frames if isinstance(frames, list) else []


# --- Default command registrations ---------------------------------------
from executors import movement, inventory  # noqa: E402
from executors.look import look_cmd, where_cmd  # noqa: E402


def help_cmd(cmd: Dict[str, Any], ctx: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Provide help information for commands."""
    args = cmd.get("args", [])
    if args:
        target = resolve(args[0])
        if not target:
            return [{"type": "text", "data": f"No help for {args[0]}"}]
        lines = [target.description or ""]
        if target.usage:
            lines.append(f"Usage: {target.usage}")
        if target.examples:
            lines.append("Examples:")
            lines.extend(f"  {ex}" for ex in target.examples)
        return [{"type": "text", "data": "\n".join(lines)}]

    rows = [
        {"command": d.name, "description": d.description or ""}
        for d in _commands.values()
    ]
    rows.sort(key=lambda r: r["command"])
    return [{"type": "table", "data": rows}]


register({
    "name": "help",
    "aliases": ["?"],
    "exec": help_cmd,
    "description": "List available commands or show help for a command",
    "usage": "help [command]",
    "examples": ["help", "help use"],
})

for name, alias in (
    ("n", "north"),
    ("s", "south"),
    ("e", "east"),
    ("w", "west"),
):
    register({
        "name": name,
        "aliases": [alias],
        "exec": movement.move,
        "description": f"Move {alias}",
    })

register({
    "name": "move",
    "aliases": ["go"],
    "exec": movement.move,
    "description": "Move in a direction",
    "usage": "move <n|s|e|w>",
    "examples": ["move north", "go east"],
})

register({
    "name": "look",
    "aliases": ["l"],
    "exec": look_cmd,
    "description": "Look around",
    "usage": "look [target]",
    "examples": ["look", "look chest"],
})

register({
    "name": "where",
    "exec": where_cmd,
    "description": "Show current location",
})

register({
    "name": "inv",
    "aliases": ["inventory", "i"],
    "exec": inventory.inv,
    "description": "Show inventory",
    "usage": "inv",
    "examples": ["inv"],
})

register({
    "name": "inspect",
    "exec": inventory.inspect_cmd,
    "description": "Inspect item",
})

register({
    "name": "use",
    "exec": inventory.use_cmd,
    "description": "Use item",
    "usage": "use <item>",
    "examples": ["use potion"],
})

register({
    "name": "equip",
    "exec": inventory.equip_cmd,
    "description": "Equip item",
    "usage": "equip <item>",
    "examples": ["equip sword"],
})

register({
    "name": "unequip",
    "exec": inventory.unequip_cmd,
    "description": "Unequip slot",
})

register({
    "name": "drop",
    "exec": inventory.drop_cmd,
    "description": "Drop item",
})

register({
    "name": "take",
    "exec": inventory.take_cmd,
    "description": "Take item",
})
