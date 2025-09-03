"""
Forward-looking inventory: extend items, add starter_loadouts and character_items

Revision ID: fe12c3a4b9a3
Revises: d4b5d8f83c21
Create Date: 2025-09-03

"""
from alembic import op
import sqlalchemy as sa


revision = "fe12c3a4b9a3"
down_revision = "d4b5d8f83c21"
branch_labels = None
depends_on = None


def _json_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    return sa.JSON


def upgrade() -> None:
    json_type = _json_type()

    # --- Extend existing items table ---
    with op.batch_alter_table("items") as batch:
        batch.add_column(sa.Column("slug", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("catalog_no", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("slot", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("stackable", sa.Boolean(), nullable=True))
        batch.add_column(sa.Column("max_stack", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("level_req", sa.Integer(), nullable=True, server_default=sa.text("1")))
        batch.add_column(sa.Column("icon_path", sa.String(length=256), nullable=True))
        batch.add_column(sa.Column("weight", sa.Float(), nullable=True))
        batch.add_column(sa.Column("value", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("stats", json_type, nullable=True))
        batch.add_column(sa.Column("on_use", json_type, nullable=True))
        batch.add_column(sa.Column("on_equip", json_type, nullable=True))
        batch.add_column(sa.Column("tags", json_type, nullable=True))
        batch.add_column(sa.Column("created_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
    # Indexes/uniques for new columns
    op.create_index(op.f("ix_items_slug"), "items", ["slug"], unique=True)
    op.create_index(op.f("ix_items_catalog_no"), "items", ["catalog_no"], unique=True)

    # --- New starter_loadouts table ---
    op.create_table(
        "starter_loadouts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("class", sa.String(length=32), nullable=False, index=False),
        sa.Column("level_min", sa.Integer(), nullable=False),
        sa.Column("level_max", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.String(length=64), sa.ForeignKey("items.item_id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_starter_loadouts_class_levels", "starter_loadouts", ["class", "level_min", "level_max"], unique=False)

    # --- New character_items table ---
    op.create_table(
        "character_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("character_id", sa.String(length=64), sa.ForeignKey("character.character_id"), nullable=False),
        sa.Column("item_id", sa.String(length=64), sa.ForeignKey("items.item_id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("slot", sa.String(length=32), nullable=True),
        sa.Column("durability", sa.Integer(), nullable=True),
        sa.Column("bound", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_character_items_char_item",
        "character_items",
        ["character_id", "item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_character_items_char_item", table_name="character_items")
    op.drop_table("character_items")

    op.drop_index("ix_starter_loadouts_class_levels", table_name="starter_loadouts")
    op.drop_table("starter_loadouts")

    with op.batch_alter_table("items") as batch:
        batch.drop_column("updated_at")
        batch.drop_column("created_at")
        batch.drop_column("tags")
        batch.drop_column("on_equip")
        batch.drop_column("on_use")
        batch.drop_column("stats")
        batch.drop_column("value")
        batch.drop_column("weight")
        batch.drop_column("icon_path")
        batch.drop_column("level_req")
        batch.drop_column("max_stack")
        batch.drop_column("stackable")
        batch.drop_column("slot")
        batch.drop_column("description")
        batch.drop_column("catalog_no")
        batch.drop_column("slug")
    op.drop_index(op.f("ix_items_catalog_no"), table_name="items")
    op.drop_index(op.f("ix_items_slug"), table_name="items")

