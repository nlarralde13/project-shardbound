"""Minimal seed for equipment demo"""
from api import create_app
from api.models import db, User, Character, Item, CharacterItem

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
        db.session.commit()
        # ownership (pre-equip sword via slot)
        db.session.add(CharacterItem(character_id=char.character_id, item_id="sword", quantity=1, slot="mainhand"))
        for item in [shield, helm, ring, chest]:
            db.session.add(CharacterItem(character_id=char.character_id, item_id=item.item_id, quantity=1))
        db.session.commit()
        print("Seeded character", char.character_id)

if __name__ == "__main__":
    run()
