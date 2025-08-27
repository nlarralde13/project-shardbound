from pathlib import Path

from server.world_loader import load_world


def test_load_world_populates_world_sets() -> None:
    path = Path(__file__).parent / "fixtures" / "sample_shard.json"
    world = load_world(path)

    assert any(p["x"] == 0 and p["y"] == 0 and p["type"] == "citie" for p in world.pois)
    assert any(p["x"] == 1 and p["y"] == 0 and p["type"] == "landmark" for p in world.pois)

    assert world.roads == [[(0, 0), (1, 0)]]
    assert world.requires_boat == {(1, 1)}
