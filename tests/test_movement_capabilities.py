"""Tests for movement capabilities in player_engine.can_enter."""

from dataclasses import dataclass, field

import pytest

from engine.player_engine import Player, can_enter


@dataclass
class DummyWorld:
    size: tuple[int, int] = (3, 3)
    road_tiles: set[tuple[int, int]] = field(default_factory=set)
    bridge_tiles: set[tuple[int, int]] = field(default_factory=set)
    blocked_land: set[tuple[int, int]] = field(default_factory=set)
    requires_boat: set[tuple[int, int]] = field(default_factory=set)
    biomes: dict[tuple[int, int], str] = field(default_factory=dict)

    def biome_at(self, x: int, y: int) -> str:
        return self.biomes.get((x, y), "plains")


@pytest.fixture
def world() -> DummyWorld:
    return DummyWorld(
        blocked_land={(0, 1)},
        requires_boat={(1, 0)},
        biomes={(2, 2): "Mountains"},
    )


def test_requires_boat_without_capabilities(world: DummyWorld) -> None:
    player = Player()
    ok, reason = can_enter(world, 1, 0, player)
    assert (ok, reason) == (False, "need_boat")


def test_can_swim_allows_entering_water(world: DummyWorld) -> None:
    player = Player()
    player.flags["can_swim"] = True
    ok, _ = can_enter(world, 1, 0, player)
    assert ok


def test_can_fly_bypasses_restrictions(world: DummyWorld) -> None:
    player = Player()
    player.flags["can_fly"] = True

    ok_water, _ = can_enter(world, 1, 0, player)  # requires_boat
    ok_blocked, _ = can_enter(world, 0, 1, player)  # blocked land
    ok_mountain, _ = can_enter(world, 2, 2, player)  # impassable biome

    assert ok_water and ok_blocked and ok_mountain


def test_has_boat_still_allows_water(world: DummyWorld) -> None:
    player = Player()
    player.flags["has_boat"] = True
    ok, _ = can_enter(world, 1, 0, player)
    assert ok

