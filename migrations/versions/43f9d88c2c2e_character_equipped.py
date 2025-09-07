"""character_equipped table and combat_snapshot column

Revision ID: 43f9d88c2c2e
Revises: fe12c3a4b9a3
Create Date: 2025-09-05
"""
from alembic import op
import sqlalchemy as sa

revision = '43f9d88c2c2e'
down_revision = 'fe12c3a4b9a3'
branch_labels = None
depends_on = None


def _json_type():
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import JSONB
        return JSONB
    return sa.JSON


def upgrade() -> None:
    json_type = _json_type()
    op.add_column('character', sa.Column('combat_snapshot', json_type, nullable=True))
    op.create_table(
        'character_equipped',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('character_id', sa.String(length=64), sa.ForeignKey('character.character_id', ondelete='CASCADE'), nullable=False),
        sa.Column('slot', sa.String(length=32), nullable=False),
        sa.Column('item_instance_id', sa.String(length=64), sa.ForeignKey('item_instances.instance_id'), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('character_id', 'slot', name='uq_character_equipped_slot')
    )
    op.create_index('ix_character_equipped_character_id', 'character_equipped', ['character_id'])
    op.create_index('ix_character_equipped_slot', 'character_equipped', ['slot'])


def downgrade() -> None:
    op.drop_index('ix_character_equipped_slot', table_name='character_equipped')
    op.drop_index('ix_character_equipped_character_id', table_name='character_equipped')
    op.drop_table('character_equipped')
    op.drop_column('character', 'combat_snapshot')
