from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Exercise, Workout, WorkoutSet
from app.schemas import ExerciseCreate, ExerciseRead, WorkoutCreate, WorkoutRead

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/exercises", response_model=list[ExerciseRead])
def list_exercises(db: DatabaseSession) -> list[Exercise]:
    return list(db.scalars(select(Exercise).order_by(Exercise.name)))


@router.post("/exercises", response_model=ExerciseRead, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: ExerciseCreate, db: DatabaseSession) -> Exercise:
    exercise = Exercise(**payload.model_dump())
    db.add(exercise)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exercise name already exists") from error
    db.refresh(exercise)
    return exercise


@router.get("/workouts", response_model=list[WorkoutRead])
def list_workouts(db: DatabaseSession) -> list[Workout]:
    statement = (
        select(Workout)
        .options(selectinload(Workout.sets).selectinload(WorkoutSet.exercise))
        .order_by(Workout.performed_on.desc(), Workout.created_at.desc())
    )
    return list(db.scalars(statement))


@router.post("/workouts", response_model=WorkoutRead, status_code=status.HTTP_201_CREATED)
def create_workout(payload: WorkoutCreate, db: DatabaseSession) -> Workout:
    exercise_ids = {workout_set.exercise_id for workout_set in payload.sets}
    existing_ids = set(db.scalars(select(Exercise.id).where(Exercise.id.in_(exercise_ids))))
    missing_ids: set[UUID] = exercise_ids - existing_ids
    if missing_ids:
        raise HTTPException(status_code=422, detail="One or more exercises do not exist")

    workout = Workout(
        performed_on=payload.performed_on,
        title=payload.title,
        notes=payload.notes,
        sets=[
            WorkoutSet(position=index, **workout_set.model_dump())
            for index, workout_set in enumerate(payload.sets, start=1)
        ],
    )
    db.add(workout)
    db.commit()

    statement = (
        select(Workout)
        .where(Workout.id == workout.id)
        .options(selectinload(Workout.sets).selectinload(WorkoutSet.exercise))
    )
    return db.scalars(statement).one()
