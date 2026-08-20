"""Add users, sessions, invitations and data ownership."""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa

from alembic import op
from app.config import get_settings

revision: str = "20260820_02"
down_revision: str | None = "20260801_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    settings = get_settings()
    owner_id = uuid4()
    now = datetime.now(UTC)

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=False)
    op.bulk_insert(
        sa.table(
            "users",
            sa.column("id", sa.Uuid()),
            sa.column("username", sa.String()),
            sa.column("password_hash", sa.String()),
            sa.column("is_admin", sa.Boolean()),
            sa.column("is_active", sa.Boolean()),
            sa.column("created_at", sa.DateTime(timezone=True)),
        ),
        [
            {
                "id": owner_id,
                "username": settings.auth_username.strip().lower(),
                "password_hash": settings.auth_password_hash,
                "is_admin": True,
                "is_active": True,
                "created_at": now,
            }
        ],
    )

    op.create_table(
        "user_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index(op.f("ix_user_sessions_user_id"), "user_sessions", ["user_id"])
    op.create_index(op.f("ix_user_sessions_expires_at"), "user_sessions", ["expires_at"])
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_invitations_token_hash"), "invitations", ["token_hash"])
    op.create_index(op.f("ix_invitations_expires_at"), "invitations", ["expires_at"])

    op.add_column("exercises", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.add_column("workouts", sa.Column("user_id", sa.Uuid(), nullable=True))
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE exercises SET user_id = :owner_id"), {"owner_id": owner_id})
    connection.execute(sa.text("UPDATE workouts SET user_id = :owner_id"), {"owner_id": owner_id})
    op.alter_column("exercises", "user_id", nullable=False)
    op.alter_column("workouts", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_exercises_user_id", "exercises", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "fk_workouts_user_id", "workouts", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index(op.f("ix_exercises_user_id"), "exercises", ["user_id"])
    op.create_index(op.f("ix_workouts_user_id"), "workouts", ["user_id"])
    op.drop_constraint("exercises_name_key", "exercises", type_="unique")
    op.create_unique_constraint("uq_exercises_user_name", "exercises", ["user_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_exercises_user_name", "exercises", type_="unique")
    op.create_unique_constraint("exercises_name_key", "exercises", ["name"])
    op.drop_index(op.f("ix_workouts_user_id"), table_name="workouts")
    op.drop_index(op.f("ix_exercises_user_id"), table_name="exercises")
    op.drop_constraint("fk_workouts_user_id", "workouts", type_="foreignkey")
    op.drop_constraint("fk_exercises_user_id", "exercises", type_="foreignkey")
    op.drop_column("workouts", "user_id")
    op.drop_column("exercises", "user_id")
    op.drop_index(op.f("ix_invitations_expires_at"), table_name="invitations")
    op.drop_index(op.f("ix_invitations_token_hash"), table_name="invitations")
    op.drop_table("invitations")
    op.drop_index(op.f("ix_user_sessions_expires_at"), table_name="user_sessions")
    op.drop_index(op.f("ix_user_sessions_user_id"), table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
