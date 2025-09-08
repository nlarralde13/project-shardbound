"""add user_ui_layouts table"""
from alembic import op
import sqlalchemy as sa

revision = "1c3e2b927a41"
down_revision = "fe12c3a4b9a3"
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
    op.create_table(
        "user_ui_layouts",
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id"), primary_key=True),
        sa.Column("layout", json_type, nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("user_ui_layouts")
