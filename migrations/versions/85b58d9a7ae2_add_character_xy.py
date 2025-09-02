"""add x and y columns to character table

Revision ID: 85b58d9a7ae2
Revises: 276eb85f3f4d
Create Date: 2025-09-02 21:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "85b58d9a7ae2"
down_revision = "276eb85f3f4d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("character", schema=None) as batch_op:
        batch_op.add_column(sa.Column("x", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("y", sa.Integer(), nullable=True))

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
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = COALESCE(x, json_extract(first_time_spawn, '$.x')),
                y = COALESCE(y, json_extract(first_time_spawn, '$.y'))
            WHERE first_time_spawn IS NOT NULL
        """
        ))
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = COALESCE(x, CAST(substr(cur_loc, 1, instr(cur_loc, ',')-1) AS INT)),
                y = COALESCE(y, CAST(substr(cur_loc, instr(cur_loc, ',')+1) AS INT))
            WHERE cur_loc IS NOT NULL
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
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = COALESCE(x, CAST(first_time_spawn->>'x' AS INTEGER)),
                y = COALESCE(y, CAST(first_time_spawn->>'y' AS INTEGER))
            WHERE first_time_spawn IS NOT NULL
        """
        ))
        conn.execute(sa.text(
            """
            UPDATE character
            SET x = COALESCE(x, CAST(split_part(cur_loc, ',', 1) AS INTEGER)),
                y = COALESCE(y, CAST(split_part(cur_loc, ',', 2) AS INTEGER))
            WHERE cur_loc IS NOT NULL
        """
        ))


def downgrade() -> None:
    with op.batch_alter_table("character", schema=None) as batch_op:
        batch_op.drop_column("y")
        batch_op.drop_column("x")
