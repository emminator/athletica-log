from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import AuthenticatedUser
from app.db import get_db
from app.models import Exercise, User, Workout, WorkoutSet
from app.schemas import ExerciseCreate, ExerciseRead, WorkoutCreate, WorkoutRead

router = APIRouter(prefix="/api/v1")
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_workout_or_404(workout_id: UUID, user: User, db: Session) -> Workout:
    statement = (
        select(Workout)
        .where(Workout.id == workout_id, Workout.user_id == user.id)
        .options(selectinload(Workout.sets).selectinload(WorkoutSet.exercise))
    )
    workout = db.scalars(statement).one_or_none()
    if workout is None:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout


def validate_exercises(payload: WorkoutCreate, user: User, db: Session) -> None:
    exercise_ids = {workout_set.exercise_id for workout_set in payload.sets}
    existing_ids = set(
        db.scalars(
            select(Exercise.id).where(
                Exercise.id.in_(exercise_ids), Exercise.user_id == user.id
            )
        )
    )
    if exercise_ids - existing_ids:
        raise HTTPException(status_code=422, detail="One or more exercises do not exist")


def make_sets(payload: WorkoutCreate) -> list[WorkoutSet]:
    return [
        WorkoutSet(position=index, **workout_set.model_dump())
        for index, workout_set in enumerate(payload.sets, start=1)
    ]


@router.get("/exercises", response_model=list[ExerciseRead])
def list_exercises(user: AuthenticatedUser, db: DatabaseSession) -> list[Exercise]:
    return list(
        db.scalars(
            select(Exercise).where(Exercise.user_id == user.id).order_by(Exercise.name)
        )
    )


@router.post("/exercises", response_model=ExerciseRead, status_code=status.HTTP_201_CREATED)
def create_exercise(
    payload: ExerciseCreate, user: AuthenticatedUser, db: DatabaseSession
) -> Exercise:
    exercise = Exercise(user_id=user.id, **payload.model_dump())
    db.add(exercise)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exercise name already exists") from error
    db.refresh(exercise)
    return exercise


@router.get("/workouts", response_model=list[WorkoutRead])
def list_workouts(user: AuthenticatedUser, db: DatabaseSession) -> list[Workout]:
    statement = (
        select(Workout)
        .where(Workout.user_id == user.id)
        .options(selectinload(Workout.sets).selectinload(WorkoutSet.exercise))
        .order_by(Workout.performed_on.desc(), Workout.created_at.desc())
    )
    return list(db.scalars(statement))


@router.post("/workouts", response_model=WorkoutRead, status_code=status.HTTP_201_CREATED)
def create_workout(
    payload: WorkoutCreate, user: AuthenticatedUser, db: DatabaseSession
) -> Workout:
    validate_exercises(payload, user, db)

    workout = Workout(
        user_id=user.id,
        performed_on=payload.performed_on,
        title=payload.title,
        notes=payload.notes,
        sets=make_sets(payload),
    )
    db.add(workout)
    db.commit()

    return get_workout_or_404(workout.id, user, db)


@router.put("/workouts/{workout_id}", response_model=WorkoutRead)
def update_workout(
    workout_id: UUID,
    payload: WorkoutCreate,
    user: AuthenticatedUser,
    db: DatabaseSession,
) -> Workout:
    workout = get_workout_or_404(workout_id, user, db)
    validate_exercises(payload, user, db)
    workout.performed_on = payload.performed_on
    workout.title = payload.title
    workout.notes = payload.notes
    workout.sets = make_sets(payload)
    db.commit()
    return get_workout_or_404(workout.id, user, db)


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(
    workout_id: UUID, user: AuthenticatedUser, db: DatabaseSession
) -> Response:
    workout = get_workout_or_404(workout_id, user, db)
    db.delete(workout)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
