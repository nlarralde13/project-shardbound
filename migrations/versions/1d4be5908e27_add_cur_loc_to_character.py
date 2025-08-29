"""add cur_loc to character

Revision ID: 1d4be5908e27
Revises: 4d862eaccc3f
Create Date: 2025-09-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '1d4be5908e27'
down_revision = '4d862eaccc3f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('character', sa.Column('cur_loc', sa.String(length=64), nullable=True))
    op.execute("UPDATE character SET cur_loc = x || ',' || y WHERE x IS NOT NULL AND y IS NOT NULL")


def downgrade():
    op.drop_column('character', 'cur_loc')
