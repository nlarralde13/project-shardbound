"""drop x and y columns from character table

Revision ID: 9b07fd5d213a
Revises: 85b58d9a7ae2
Create Date: 2025-09-02 22:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "9b07fd5d213a"
down_revision = "85b58d9a7ae2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "sqlite":
        conn.execute(sa.text(
            """
            UPDATE character
            SET last_coords = json_set(COALESCE(last_coords, '{}'), '$.x', x, '$.y', y)
            WHERE x IS NOT NULL AND y IS NOT NULL
            """
        ))
    else:
        conn.execute(sa.text(
            """
            UPDATE character
            SET last_coords = jsonb_set(
                jsonb_set(COALESCE(last_coords, '{}'::jsonb), '{x}', to_jsonb(x)),
                '{y}', to_jsonb(y)
            )
            WHERE x IS NOT NULL AND y IS NOT NULL
            """
        ))

    with op.batch_alter_table("character", schema=None) as batch_op:
        batch_op.drop_column("x")
        batch_op.drop_column("y")


def downgrade() -> None:
    with op.batch_alter_table("character", schema=None) as batch_op:
        batch_op.add_column(sa.Column("y", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("x", sa.Integer(), nullable=True))

    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "sqlite":
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = json_extract(last_coords, '$.x'),
                y = json_extract(last_coords, '$.y')
            WHERE last_coords IS NOT NULL
            """
        ))
    else:
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = CAST(last_coords->>'x' AS INTEGER),
                y = CAST(last_coords->>'y' AS INTEGER)
            WHERE last_coords IS NOT NULL
            """
        ))
