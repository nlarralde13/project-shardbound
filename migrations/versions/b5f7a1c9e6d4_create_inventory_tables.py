"""create item and inventory_item tables"""

from alembic import op
import sqlalchemy as sa


revision = "b5f7a1c9e6d4"
down_revision = "9b07fd5d213a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "items_v1",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("icon_url", sa.String(length=256), nullable=False),
        sa.Column(
            "stackable", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column(
            "max_stack", sa.Integer(), nullable=False, server_default=sa.text("99")
        ),
        sa.Column(
            "rarity",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'common'"),
        ),
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.create_index(
        op.f("ix_items_v1_slug"), "items_v1", ["slug"], unique=True
    )

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "character_id", sa.String(), sa.ForeignKey("character.character_id"), nullable=False
        ),
        sa.Column(
            "item_id", sa.Integer(), sa.ForeignKey("items_v1.id"), nullable=False
        ),
        sa.Column(
            "quantity", sa.Integer(), nullable=False, server_default=sa.text("1")
        ),
        sa.UniqueConstraint("character_id", "item_id", name="uq_character_item"),
    )


def downgrade() -> None:
    op.drop_table("inventory_items")
    op.drop_index(op.f("ix_items_v1_slug"), table_name="items_v1")
    op.drop_table("items_v1")

