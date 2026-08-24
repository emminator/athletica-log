"""Add persistent login throttling."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260824_04"
down_revision: str | None = "20260822_03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_throttles",
        sa.Column("identifier_hash", sa.String(length=64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("identifier_hash"),
    )
    op.create_index(
        op.f("ix_login_throttles_blocked_until"),
        "login_throttles",
        ["blocked_until"],
    )
    op.create_index(
        op.f("ix_login_throttles_updated_at"),
        "login_throttles",
        ["updated_at"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_login_throttles_updated_at"), table_name="login_throttles")
    op.drop_index(op.f("ix_login_throttles_blocked_until"), table_name="login_throttles")
    op.drop_table("login_throttles")
