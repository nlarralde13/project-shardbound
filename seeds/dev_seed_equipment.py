"""Minimal seed for equipment demo"""
from api import create_app
from api.models import db, User, Character, Item, ItemInstance, CharacterItem, CharacterEquipped

def run():
    app = create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        user = User(user_id="user1", email="demo@example.com", password_hash="x", display_name="Demo")
        db.session.add(user)
        char = Character(name="Hero", user_id=user.user_id)
        db.session.add(char)
        # templates
        sword = Item(item_id="sword", item_version="1", name="Sword", type="weapon", rarity="common", stats={"attack": 3}, slot="main_hand")
        shield = Item(item_id="shield", item_version="1", name="Shield", type="armor", rarity="common", stats={"armor": 2}, slot="off_hand")
        helm = Item(item_id="helm", item_version="1", name="Helm", type="armor", rarity="common", stats={"armor": 1}, slot="head")
        ring = Item(item_id="ring", item_version="1", name="Ring", type="trinket", rarity="common", stats={"crit_chance": 1}, slot="ring1")
        chest = Item(item_id="chest", item_version="1", name="Chest", type="armor", rarity="common", stats={"armor": 3}, slot="chest")
        db.session.add_all([sword, shield, helm, ring, chest])
        # instances
        inst1 = ItemInstance(instance_id="sword1", item_id="sword", item_version="1")
        inst2 = ItemInstance(instance_id="shield1", item_id="shield", item_version="1")
        inst3 = ItemInstance(instance_id="helm1", item_id="helm", item_version="1")
        inst4 = ItemInstance(instance_id="ring1", item_id="ring", item_version="1")
        inst5 = ItemInstance(instance_id="chest1", item_id="chest", item_version="1")
        db.session.add_all([inst1, inst2, inst3, inst4, inst5])
        # ownership
        for item in [sword, shield, helm, ring, chest]:
            db.session.add(CharacterItem(character_id=char.character_id, item_id=item.item_id, quantity=1))
        db.session.commit()
        # pre-equip sword
        ce = CharacterEquipped(character_id=char.character_id, slot="main_hand", item_instance_id="sword1")
        db.session.add(ce)
        db.session.commit()
        print("Seeded character", char.character_id)

if __name__ == "__main__":
    run()
