"""add rbac and audit log tables

Revision ID: 276eb85f3f4d
Revises: 4c0ec93710c3
Create Date: 2025-02-14
"""

from alembic import op
import sqlalchemy as sa


revision = "276eb85f3f4d"
down_revision = "4c0ec93710c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # roles / scopes on users
    op.add_column("users", sa.Column("role", sa.String(length=16), nullable=False, server_default="user"))
    op.add_column("users", sa.Column("scopes", sa.JSON(), nullable=True))
    # audit table
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("actor_user_id", sa.String(), sa.ForeignKey("users.user_id")),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("target_type", sa.String(length=64)),
        sa.Column("target_id", sa.String(length=64)),
        sa.Column("payload", sa.JSON()),
        sa.Column("ip", sa.String(length=64)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("admin_audit_logs")
    op.drop_column("users", "scopes")
    op.drop_column("users", "role")

