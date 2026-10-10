"""add search_mode and rerank_used to query_logs

Revision ID: f1e2d3c4b5a6
Revises: d62c0760b90c
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, None] = 'd62c0760b90c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('query_logs', sa.Column('search_mode', sa.String(length=16), nullable=True))
    op.add_column('query_logs', sa.Column('rerank_used', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('query_logs', 'rerank_used')
    op.drop_column('query_logs', 'search_mode')
