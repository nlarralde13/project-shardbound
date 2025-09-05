from server import settlements


def test_upgrade_initializes_from_pois():
    data = {
        "grid": [],
        "pois": [{"x": 1, "y": 2, "type": "City", "name": "Alpha"}],
    }
    settlements.upgrade_settlements(data)
    assert isinstance(data.get("settlements"), list)
    assert len(data["settlements"]) == 1
    s = data["settlements"][0]
    assert s["anchor"] == {"x": 1, "y": 2}
    assert s["footprint"] == {"w": 1, "h": 1}
    assert s["tier"] == 1
    assert data["settlements_schema_version"] == settlements.SETTLEMENT_SCHEMA_VERSION


def test_existing_settlement_upgraded_non_destructive():
    data = {
        "settlements": [
            {
                "id": "abc",
                "tier": 3,
                "anchor": {"x": 5, "y": 6},
                "meta": {"foo": 1},
                "custom": "keep",
            }
        ]
    }
    settlements.upgrade_settlements(data)
    s = data["settlements"][0]
    assert s["id"] == "abc"
    assert s["meta"]["foo"] == 1
    assert s["custom"] == "keep"
    assert s["footprint"] == {"w": 2, "h": 2}  # tier 3 -> 2x2
    assert s["links"] == {"roads": [], "shardgates": []}


def test_upsert_and_remove():
    data = {}
    entry = {"anchor": {"x": 3, "y": 4}, "name": "Beta", "tier": 5}
    s = settlements.upsertSettlement(data, entry)
    assert s["id"] == "sett_3_4"
    assert s["footprint"] == {"w": 4, "h": 4}
    assert len(data["settlements"]) == 1
    removed = settlements.removeSettlement(data, s["id"])
    assert removed is True
    assert data["settlements"] == []
