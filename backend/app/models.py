from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ActivityType(StrEnum):
    STRENGTH = "strength"
    CARDIO = "cardio"
    MOBILITY = "mobility"
    OTHER = "other"


class Exercise(Base):
    __tablename__ = "exercises"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    muscle_group: Mapped[str | None] = mapped_column(String(80))
    activity_type: Mapped[ActivityType] = mapped_column(Enum(ActivityType))


class Workout(Base):
    __tablename__ = "workouts"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    performed_on: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now)
    sets: Mapped[list["WorkoutSet"]] = relationship(back_populates="workout", cascade="all, delete-orphan")


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workout_id: Mapped[UUID] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"))
    exercise_id: Mapped[UUID] = mapped_column(ForeignKey("exercises.id"))
    position: Mapped[int] = mapped_column(Integer)
    repetitions: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    effort_rpe: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    workout: Mapped[Workout] = relationship(back_populates="sets")

