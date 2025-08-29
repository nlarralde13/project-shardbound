"""add gameplay models

Revision ID: ea7c899e31ea
Revises: 1d4be5908e27
Create Date: 2025-08-29 22:43:10.369305

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ea7c899e31ea'
down_revision = '1d4be5908e27'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'towns',
        sa.Column('town_id', sa.String(length=64), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('world_x', sa.Integer(), nullable=False),
        sa.Column('world_y', sa.Integer(), nullable=False),
        sa.Column('grid_w', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('grid_h', sa.Integer(), nullable=False, server_default='1'),
    )
    op.create_table(
        'town_rooms',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('town_id', sa.String(length=64), sa.ForeignKey('towns.town_id'), nullable=False),
        sa.Column('room_x', sa.Integer(), nullable=False),
        sa.Column('room_y', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False, server_default='room'),
        sa.Column('label', sa.String(length=64)),
    )
    op.create_index('ix_town_rooms_town_id', 'town_rooms', ['town_id'])
    op.create_table(
        'npcs',
        sa.Column('npc_id', sa.String(length=64), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
    )
    op.create_table(
        'quests',
        sa.Column('quest_id', sa.String(length=64), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('giver_npc_id', sa.String(length=64), sa.ForeignKey('npcs.npc_id')),
        sa.Column('type', sa.String(length=32), nullable=False),
        sa.Column('target_world_x', sa.Integer()),
        sa.Column('target_world_y', sa.Integer()),
        sa.Column('required_item_id', sa.String(length=64)),
        sa.Column('reward_json', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_table(
        'quest_states',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('character_id', sa.String(length=64), sa.ForeignKey('character.character_id'), nullable=False),
        sa.Column('quest_id', sa.String(length=64), sa.ForeignKey('quests.quest_id'), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='available'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_quest_states_character_id', 'quest_states', ['character_id'])
    op.create_table(
        'character_states',
        sa.Column('character_id', sa.String(length=64), sa.ForeignKey('character.character_id'), primary_key=True),
        sa.Column('mode', sa.String(length=16), nullable=False, server_default='overworld'),
        sa.Column('town_id', sa.String(length=64), sa.ForeignKey('towns.town_id')),
        sa.Column('room_x', sa.Integer()),
        sa.Column('room_y', sa.Integer()),
    )
    op.create_table(
        'encounter_triggers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('label', sa.String(length=64), nullable=False),
        sa.Column('world_x', sa.Integer(), nullable=False),
        sa.Column('world_y', sa.Integer(), nullable=False),
        sa.Column('script_id', sa.String(length=64), nullable=False),
    )


def downgrade():
    op.drop_table('encounter_triggers')
    op.drop_table('character_states')
    op.drop_index('ix_quest_states_character_id', table_name='quest_states')
    op.drop_table('quest_states')
    op.drop_table('quests')
    op.drop_table('npcs')
    op.drop_index('ix_town_rooms_town_id', table_name='town_rooms')
    op.drop_table('town_rooms')
    op.drop_table('towns')
