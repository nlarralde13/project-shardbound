"""seed demo items and a sample character inventory"""

from alembic import op
import sqlalchemy as sa
import datetime as dt


revision = "d4b5d8f83c21"
down_revision = "b5f7a1c9e6d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = dt.datetime.utcnow()

    items_table = sa.table(
        "items_v1",
        sa.column("id", sa.Integer),
        sa.column("slug", sa.String),
        sa.column("display_name", sa.String),
        sa.column("icon_url", sa.String),
        sa.column("stackable", sa.Boolean),
        sa.column("max_stack", sa.Integer),
        sa.column("rarity", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        items_table,
        [
            {
                "id": 1,
                "slug": "iron-sword",
                "display_name": "Iron Sword",
                "icon_url": "/static/assets/items/iron_sword.png",
                "stackable": False,
                "max_stack": 1,
                "rarity": "common",
                "description": "A sturdy iron blade.",
            },
            {
                "id": 2,
                "slug": "health-potion",
                "display_name": "Health Potion",
                "icon_url": "/static/assets/items/health_potion.png",
                "stackable": True,
                "max_stack": 20,
                "rarity": "common",
                "description": "Restores a small amount of HP.",
            },
            {
                "id": 3,
                "slug": "oak-wood",
                "display_name": "Oak Wood",
                "icon_url": "/static/assets/items/oak_wood.png",
                "stackable": True,
                "max_stack": 99,
                "rarity": "common",
                "description": "A piece of oak wood.",
            },
        ],
    )

    users_table = sa.table(
        "users",
        sa.column("user_id", sa.String),
        sa.column("email", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        users_table,
        [
            {
                "user_id": "demo-user",
                "email": "demo@example.com",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        ],
    )

    chars_table = sa.table(
        "character",
        sa.column("character_id", sa.String),
        sa.column("user_id", sa.String),
        sa.column("name", sa.String),
        sa.column("is_deleted", sa.Boolean),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    op.bulk_insert(
        chars_table,
        [
            {
                "character_id": "demo-character-id",
                "user_id": "demo-user",
                "name": "Demo Hero",
                "is_deleted": False,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
        ],
    )

    inv_table = sa.table(
        "inventory_items",
        sa.column("character_id", sa.String),
        sa.column("item_id", sa.Integer),
        sa.column("quantity", sa.Integer),
    )
    op.bulk_insert(
        inv_table,
        [
            {"character_id": "demo-character-id", "item_id": 1, "quantity": 1},
            {"character_id": "demo-character-id", "item_id": 2, "quantity": 5},
            {"character_id": "demo-character-id", "item_id": 3, "quantity": 12},
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM inventory_items WHERE character_id='demo-character-id'")
    op.execute("DELETE FROM character WHERE character_id='demo-character-id'")
    op.execute("DELETE FROM users WHERE user_id='demo-user'")
    op.execute("DELETE FROM items_v1 WHERE id IN (1,2,3)")

