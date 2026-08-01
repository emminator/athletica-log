"""Create exercises, workouts and workout sets."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260801_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    activity_type = sa.Enum(
        "STRENGTH", "CARDIO", "MOBILITY", "OTHER", name="activitytype", native_enum=False
    )
    op.create_table(
        "exercises",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("muscle_group", sa.String(length=80), nullable=True),
        sa.Column("activity_type", activity_type, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_exercises_name"), "exercises", ["name"], unique=False)
    op.create_table(
        "workouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workouts_performed_on"), "workouts", ["performed_on"], unique=False)
    op.create_table(
        "workout_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workout_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Numeric(precision=7, scale=2), nullable=True),
        sa.Column("effort_rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["workout_id"], ["workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("workout_sets")
    op.drop_index(op.f("ix_workouts_performed_on"), table_name="workouts")
    op.drop_table("workouts")
    op.drop_index(op.f("ix_exercises_name"), table_name="exercises")
    op.drop_table("exercises")
