from .base import db, Model, metadata

# Import model modules so tables register with metadata
from .users import User                      # noqa: F401
from .characters import Character            # noqa: F401
from .items import Item                      # noqa: F401
from .inventory import ItemInstance, CharacterInventory   # noqa: F401
from .item import Item as ItemV1             # noqa: F401
from .inventory_item import InventoryItem    # noqa: F401
# Gameplay models
from .gameplay import (
    Town, TownRoom, NPC, Quest, QuestState, CharacterState, EncounterTrigger,
)  # noqa: F401
from .audit import AdminAuditLog  # noqa: F401
# from .crafting import Recipe               # noqa: F401

__all__ = [
    "db", "Model", "metadata",
    "User", "Character",
    "Item", "ItemInstance", "CharacterInventory",
    "ItemV1", "InventoryItem",
    "Town", "TownRoom", "NPC", "Quest", "QuestState", "CharacterState", "EncounterTrigger",
    "AdminAuditLog",
    # "Recipe",
]
