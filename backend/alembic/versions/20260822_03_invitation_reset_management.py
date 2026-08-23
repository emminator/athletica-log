"""Add invitation revocation and tester password resets."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260822_03"
down_revision: str | None = "20260820_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "invitations", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_table(
        "password_resets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_password_resets_token_hash"), "password_resets", ["token_hash"])
    op.create_index(op.f("ix_password_resets_user_id"), "password_resets", ["user_id"])
    op.create_index(op.f("ix_password_resets_expires_at"), "password_resets", ["expires_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_password_resets_expires_at"), table_name="password_resets")
    op.drop_index(op.f("ix_password_resets_user_id"), table_name="password_resets")
    op.drop_index(op.f("ix_password_resets_token_hash"), table_name="password_resets")
    op.drop_table("password_resets")
    op.drop_column("invitations", "revoked_at")
