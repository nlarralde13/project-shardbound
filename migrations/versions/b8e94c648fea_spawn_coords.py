"""add spawn coord columns"""
from alembic import op
import sqlalchemy as sa
import json

# revision identifiers, used by Alembic.
revision = 'b8e94c648fea'
down_revision = '1d4be5908e27'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    op.add_column('character', sa.Column('first_time_spawn', sa.JSON(), nullable=True))
    op.add_column('character', sa.Column('last_coords', sa.JSON(), nullable=True))
    rows = conn.execute(sa.text("SELECT character_id, x, y FROM character")).fetchall()
    for cid, x, y in rows:
        if x is not None and y is not None:
            coords = json.dumps({"x": int(x), "y": int(y)})
            conn.execute(
                sa.text("UPDATE character SET first_time_spawn=:c, last_coords=:c WHERE character_id=:cid"),
                {"c": coords, "cid": cid},
            )
    op.drop_column('character', 'x')
    op.drop_column('character', 'y')


def downgrade():
    conn = op.get_bind()
    op.add_column('character', sa.Column('x', sa.Integer(), nullable=True))
    op.add_column('character', sa.Column('y', sa.Integer(), nullable=True))
    rows = conn.execute(sa.text("SELECT character_id, last_coords FROM character")).fetchall()
    for cid, coords in rows:
        x = y = None
        if coords:
            try:
                data = json.loads(coords)
                x = data.get('x')
                y = data.get('y')
            except Exception:
                pass
        conn.execute(
            sa.text("UPDATE character SET x=:x, y=:y WHERE character_id=:cid"),
            {"x": x, "y": y, "cid": cid},
        )
    op.drop_column('character', 'last_coords')
    op.drop_column('character', 'first_time_spawn')
