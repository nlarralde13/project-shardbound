"""Tests for inventory command executors."""

import os
import tempfile

from api import create_app
import command_router as router
from api.models import db, Item, Character, CharacterInventory


def _setup_app():
    fd, path = tempfile.mkstemp()
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    app = create_app()
    return app, path


def test_inventory_lifecycle():
    app, path = _setup_app()
    try:
        with app.app_context():
            char = Character(user_id="u1", name="Hero")
            db.session.add(char)
            sword = Item(
                item_id="sword",
                item_version="v1",
                name="Sword",
                type="weapon",
                rarity="common",
                stack_size=1,
                base_stats={},
            )
            potion = Item(
                item_id="potion",
                item_version="v1",
                name="Potion",
                type="consumable",
                rarity="common",
                stack_size=99,
                base_stats={},
            )
            db.session.add_all([sword, potion])
            db.session.commit()

            inv_sword = CharacterInventory(
                id="inv1",
                character_id=char.character_id,
                slot_index=0,
                item_id="sword",
                qty=1,
            )
            inv_potion = CharacterInventory(
                id="inv2",
                character_id=char.character_id,
                slot_index=1,
                item_id="potion",
                qty=2,
            )
            db.session.add_all([inv_sword, inv_potion])
            db.session.commit()

            with app.test_request_context():
                router.route("equip sword", None, char, db.session)
            row = CharacterInventory.query.filter_by(character_id=char.character_id, item_id="sword").first()
            assert row.equipped is True

            with app.test_request_context():
                router.route("use potion", None, char, db.session)
            row_p = CharacterInventory.query.filter_by(character_id=char.character_id, item_id="potion").first()
            assert row_p.qty == 1

            with app.test_request_context():
                router.route("unequip 0", None, char, db.session)
            row = CharacterInventory.query.filter_by(character_id=char.character_id, item_id="sword").first()
            assert row.equipped is False

            with app.test_request_context():
                frames = router.route("inv", None, char, db.session)
            table = next(f for f in frames if f["type"] == "table")["data"]
            sword_row = next(r for r in table if r["item"] == "Sword")
            potion_row = next(r for r in table if r["item"] == "Potion")
            assert sword_row["equipped"] == "no"
            assert potion_row["qty"] == 1
    finally:
        os.remove(path)

