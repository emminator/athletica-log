from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ActivityType


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    muscle_group: str | None = Field(default=None, max_length=80)
    activity_type: ActivityType = ActivityType.STRENGTH


class ExerciseRead(ExerciseCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class WorkoutSetCreate(BaseModel):
    exercise_id: UUID
    repetitions: int | None = Field(default=None, ge=1, le=1000)
    weight_kg: Decimal | None = Field(default=None, ge=0, le=2000, decimal_places=2)
    effort_rpe: Decimal | None = Field(default=None, ge=1, le=10, decimal_places=1)

    @model_validator(mode="after")
    def require_performance(self) -> "WorkoutSetCreate":
        if self.repetitions is None and self.weight_kg is None:
            raise ValueError("A set needs repetitions or a weight")
        return self


class WorkoutCreate(BaseModel):
    performed_on: date
    title: str = Field(min_length=2, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    sets: list[WorkoutSetCreate] = Field(min_length=1, max_length=200)


class WorkoutSetRead(WorkoutSetCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    position: int
    exercise: ExerciseRead


class WorkoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    performed_on: date
    title: str
    notes: str | None
    created_at: datetime
    sets: list[WorkoutSetRead]

