"""add stage_latencies, chunk_scores, estimated_cost_usd, feedback to query_logs

Revision ID: b8c4d2e6f1a3
Revises: a7b3c9d1e2f4
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b8c4d2e6f1a3'
down_revision: Union[str, None] = 'a7b3c9d1e2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('query_logs', sa.Column('stage_latencies', postgresql.JSONB(), nullable=True))
    op.add_column('query_logs', sa.Column('chunk_scores', postgresql.JSONB(), nullable=True))
    op.add_column('query_logs', sa.Column('estimated_cost_usd', sa.Float(), nullable=True))
    op.add_column('query_logs', sa.Column('feedback', sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column('query_logs', 'feedback')
    op.drop_column('query_logs', 'estimated_cost_usd')
    op.drop_column('query_logs', 'chunk_scores')
    op.drop_column('query_logs', 'stage_latencies')
