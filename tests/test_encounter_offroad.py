from dataclasses import dataclass, field

import pytest

from flask import Flask

from app.api import routes
import server.combat as combat
from server.player_engine import Player


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
def client(monkeypatch):
    app = Flask(__name__)
    app.secret_key = "test"
    app.register_blueprint(routes.bp)
    world = DummyWorld(road_tiles={(0, 0)})
    monkeypatch.setattr(routes, "WORLD", world)

    class DummyRoom:
        def export(self):
            return {}

    monkeypatch.setattr(routes, "get_room", lambda *args, **kwargs: DummyRoom())

    with app.test_client() as client:
        with client.session_transaction() as sess:
            player = Player()
            player.spawn(0, 0)
            sess["player"] = player.as_public()
        yield client


def test_encounter_offroad(client, monkeypatch):
    monkeypatch.setattr(combat.random, "random", lambda: 0.1)
    resp = client.post("/api/move", json={"dx": 1, "dy": 0})
    data = resp.get_json()
    assert any("A wild" in entry for entry in data["log"])


