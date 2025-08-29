from .base import db, Model, metadata

# Import model modules so tables register with metadata
from .users import User                      # noqa: F401
from .characters import Character            # noqa: F401
from .items import Item                      # noqa: F401
from .inventory import ItemInstance, CharacterInventory   # noqa: F401
# from .crafting import Recipe               # noqa: F401

__all__ = [
    "db", "Model", "metadata",
    "User", "Character",
    "Item", "ItemInstance", "CharacterInventory",
    # "Recipe",
]
