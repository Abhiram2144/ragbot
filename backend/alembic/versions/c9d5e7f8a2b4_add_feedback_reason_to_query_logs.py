"""add feedback reason to query logs"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d5e7f8a2b4"
down_revision: Union[str, None] = "b8c4d2e6f1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("query_logs", sa.Column("feedback_reason", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("query_logs", "feedback_reason")