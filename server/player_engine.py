# server/player_engine.py
from dataclasses import dataclass, field
from typing import Dict, Tuple, List, Optional

@dataclass
class QuestState:
    id: str
    status: str = "active"     # active|complete|failed
    data: dict = field(default_factory=dict)

@dataclass
class Player:
    id: str = "hero"
    name: str = "Hero"
    pos: Tuple[int, int] = (0, 0)
    hp: int = 20
    max_hp: int = 20
    energy: int = 100
    level: int = 1
    xp: int = 0
    gold: int = 0
    flags: Dict[str, bool] = field(default_factory=lambda: {"noclip": False, "has_boat": False, "can_climb": False})
    inventory: Dict[str, int] = field(default_factory=dict)
    equipment: Dict[str, Optional[str]] = field(default_factory=dict)
    quests_active: Dict[str, QuestState] = field(default_factory=dict)
    quests_done: set = field(default_factory=set)

    def as_public(self) -> dict:
        d = self.__dict__.copy()
        d["quests_active"] = {k: v.__dict__ for k, v in self.quests_active.items()}
        d["quests_done"] = list(self.quests_done)
        return d

    def spawn(self, x: int, y: int):
        self.pos = (x, y)

# ---- movement & rules --------------------------------------------------

IMPASSABLE_BIOMES = {"Mountains", "Volcano"}

def can_enter(world, x: int, y: int, player: Player) -> tuple[bool, str]:
    # dev noclip bypass
    if player.flags.get("noclip"):
        return True, "noclip"

    W, H = world.size
    if not (0 <= x < W and 0 <= y < H):
        return False, "bounds"

    # Road / bridge overrides come FIRST
    on_road   = (x, y) in world.road_tiles
    on_bridge = (x, y) in world.bridge_tiles

    # Movement layer restrictions — allow road/bridge to override
    if (x, y) in world.blocked_land and not (on_road or on_bridge):
        return False, "blocked"

    # Boat requirement — bridge overrides
    if (x, y) in world.requires_boat and not (on_bridge or player.flags.get("has_boot")):
        return False, "need_boat"

    # Terrain-based restrictions — road/bridge can carve a pass
    biome = world.biome_at(x, y)
    if biome in IMPASSABLE_BIOMES and not (on_road or on_bridge or player.flags.get("can_climb")):
        return False, "too_steep"

    return True, "ok"

def move(world, player: Player, dx: int, dy: int) -> dict:
    x, y = player.pos
    nx, ny = x + dx, y + dy
    ok, reason = can_enter(world, nx, ny, player)
    if not ok:
        return {"ok": False, "reason": reason, "pos": player.pos, "log": [f"You can't move there ({reason})."]}
    player.pos = (nx, ny)
    log = [f"You move to ({nx},{ny}) — {world.biome_at(nx,ny)}."]
    return {"ok": True, "reason": "ok", "pos": player.pos, "log": log}

# ---- Quest Q001 --------------------------------------------------------

def ensure_first_quest(player: Player):
    if "Q001" not in player.quests_active and "Q001" not in player.quests_done:
        player.quests_active["Q001"] = QuestState(id="Q001", data={"target": (15, 10)})

def check_quests(world, player: Player, log: List[str]):
    q = player.quests_active.get("Q001")
    if q and q.status == "active":
        if tuple(player.pos) == tuple(q.data["target"]):
            q.status = "complete"
            player.quests_done.add(q.id)
            player.quests_active.pop(q.id, None)
            player.gold += 30
            player.xp += 50
            log.append("Quest complete: Road to the City! (+50 XP, +30g)")
