"""add document lifecycle metadata"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e6f8a1b2c3"
down_revision: Union[str, None] = "c9d5e7f8a2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("publication_status", sa.String(length=16), server_default="published", nullable=False))
    op.add_column("documents", sa.Column("department", sa.String(length=80), server_default="HR", nullable=False))
    op.add_column("documents", sa.Column("owner", sa.String(length=255), nullable=True))
    op.add_column("documents", sa.Column("effective_date", sa.Date(), nullable=True))
    op.add_column("documents", sa.Column("review_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "review_date")
    op.drop_column("documents", "effective_date")
    op.drop_column("documents", "owner")
    op.drop_column("documents", "department")
    op.drop_column("documents", "publication_status")