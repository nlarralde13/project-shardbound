"""Tests for move function in player_engine.move."""

from dataclasses import dataclass, field

from server.player_engine import Player, move


@dataclass
class DummyWorld:
    size: tuple[int, int] = (2, 2)
    road_tiles: set[tuple[int, int]] = field(default_factory=set)
    bridge_tiles: set[tuple[int, int]] = field(default_factory=set)
    blocked_land: set[tuple[int, int]] = field(default_factory=set)
    requires_boat: set[tuple[int, int]] = field(default_factory=set)
    biomes: dict[tuple[int, int], str] = field(default_factory=dict)

    def biome_at(self, x: int, y: int) -> str:
        return self.biomes.get((x, y), "plains")


def test_move_blocked_and_open():
    world = DummyWorld(blocked_land={(1, 0)})
    player = Player()

    # Attempt to move into a blocked tile
    blocked_result = move(world, player, 1, 0)
    assert blocked_result["ok"] is False
    assert blocked_result["reason"] == "blocked"

    # Moving into an open tile
    open_result = move(world, player, 0, 1)
    assert open_result == {
        "ok": True,
        "reason": "ok",
        "pos": (0, 1),
        "log": ["You move to (0,1) — plains."],
    }
    assert player.pos == (0, 1)
