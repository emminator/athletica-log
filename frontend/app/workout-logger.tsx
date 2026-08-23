"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";
import { useLanguage } from "./language";

type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  activity_type: "strength" | "cardio" | "mobility" | "other";
};

type WorkoutSet = {
  id: string;
  exercise_id: string;
  exercise: Exercise;
  repetitions: number | null;
  weight_kg: string | null;
  effort_rpe: string | null;
};

type Workout = {
  id: string;
  title: string;
  performed_on: string;
  notes: string | null;
  sets: WorkoutSet[];
};

type DraftSet = {
  exercise_id: string;
  repetitions: string;
  weight_kg: string;
  effort_rpe: string;
};

type Feedback = {
  area: "exercise" | "workout" | "history" | "global";
  text: string;
};

const emptySet: DraftSet = { exercise_id: "", repetitions: "", weight_kg: "", effort_rpe: "" };

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function draftSets(workout: Workout): DraftSet[] {
  return workout.sets.map((set) => ({
    exercise_id: set.exercise_id,
    repetitions: set.repetitions?.toString() ?? "",
    weight_kg: set.weight_kg ?? "",
    effort_rpe: set.effort_rpe ?? "",
  }));
}

export default function WorkoutLogger() {
  const { locale, t } = useLanguage();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [performedOn, setPerformedOn] = useState(today);
  const [sets, setSets] = useState<DraftSet[]>([{ ...emptySet }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/v1/exercises"),
      apiFetch("/api/v1/workouts"),
    ])
      .then(async ([exerciseResponse, workoutResponse]) => {
        if (!exerciseResponse.ok || !workoutResponse.ok) throw new Error("load failed");
        const [exerciseData, workoutData] = await Promise.all([
          exerciseResponse.json() as Promise<Exercise[]>,
          workoutResponse.json() as Promise<Workout[]>,
        ]);
        setExercises(exerciseData);
        setWorkouts(workoutData);
      })
      .catch(() => setFeedback({ area: "global", text: "" }))
      .finally(() => setLoading(false));
  }, []);

  const totalVolume = useMemo(
    () => sets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.repetitions || 0), 0),
    [sets],
  );

  function workoutVolume(workout: Workout) {
    return workout.sets.reduce(
      (sum, set) => sum + Number(set.weight_kg ?? 0) * Number(set.repetitions ?? 0),
      0,
    );
  }

  function workoutSummary(workout: Workout) {
    const setCount = `${workout.sets.length} ${workout.sets.length === 1 ? t.workout.oneSet : t.workout.manySets}`;
    const volume = workoutVolume(workout);
    const volumeSummary = volume > 0 ? `${t.workout.totalLoad}: ${volume.toLocaleString(locale)} kg` : null;
    const exerciseNames = workout.sets
      .map((set) => set.exercise.name)
      .filter((name, index, names) => names.indexOf(name) === index)
      .join(", ");

    return [setCount, volumeSummary, exerciseNames].filter(Boolean).join(" · ");
  }

  function previousSet(exerciseId: string) {
    if (!exerciseId) return null;
    return workouts
      .flatMap((workout) => workout.sets)
      .find((workoutSet) => workoutSet.exercise_id === exerciseId) ?? null;
  }

  function previousPerformance(exerciseId: string) {
    const lastSet = previousSet(exerciseId);
    if (!lastSet) return null;
    const weight = lastSet.weight_kg ? `${Number(lastSet.weight_kg).toLocaleString(locale)} kg` : null;
    const repetitions = lastSet.repetitions ? `${lastSet.repetitions} ${t.workout.repetitionsShort}` : null;
    return [weight, repetitions].filter(Boolean).join(" × ");
  }

  function selectExercise(index: number, exerciseId: string) {
    const lastSet = previousSet(exerciseId);
    setSets((current) => current.map((set, position) => position === index ? {
      ...set,
      exercise_id: exerciseId,
      repetitions: lastSet?.repetitions?.toString() ?? "",
      weight_kg: lastSet?.weight_kg ?? "",
      effort_rpe: lastSet?.effort_rpe ?? "",
    } : set));
  }

  function toggleWorkout(workoutId: string) {
    setExpandedWorkouts((current) => {
      const updated = new Set(current);
      if (updated.has(workoutId)) updated.delete(workoutId);
      else updated.add(workoutId);
      return updated;
    });
  }

  async function addExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const response = await apiFetch("/api/v1/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: exerciseName, muscle_group: muscleGroup || null, activity_type: "strength" }),
    });
    if (!response.ok) {
      setFeedback({
        area: "exercise",
        text: response.status === 409 ? t.workout.exerciseExists : t.workout.exerciseSaveError,
      });
      return;
    }
    const exercise = (await response.json()) as Exercise;
    setExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name, locale)));
    setSets((current) => current.map((set) => (set.exercise_id ? set : { ...set, exercise_id: exercise.id })));
    setExerciseName("");
    setMuscleGroup("");
    setFeedback({ area: "exercise", text: t.workout.exerciseAdded(exercise.name) });
  }

  function updateSet(index: number, field: keyof DraftSet, value: string) {
    setSets((current) => current.map((set, position) => (position === index ? { ...set, [field]: value } : set)));
  }

  function resetForm() {
    setEditingId(null);
    setDuplicating(false);
    setFeedback(null);
    setWorkoutTitle("");
    setPerformedOn(today());
    setSets([{ ...emptySet }]);
  }

  function editWorkout(workout: Workout) {
    setEditingId(workout.id);
    setDuplicating(false);
    setWorkoutTitle(workout.title);
    setPerformedOn(workout.performed_on);
    setSets(draftSets(workout));
    setFeedback({ area: "workout", text: t.workout.editing(workout.title) });
    document.getElementById("workout-heading")?.scrollIntoView({ behavior: "smooth" });
  }

  function duplicateWorkout(workout: Workout) {
    setEditingId(null);
    setDuplicating(true);
    setWorkoutTitle(workout.title);
    setPerformedOn(today());
    setSets(draftSets(workout));
    setFeedback({ area: "workout", text: t.workout.duplicated(workout.title) });
    document.getElementById("workout-heading")?.scrollIntoView({ behavior: "smooth" });
  }

  async function saveWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const response = await apiFetch(`/api/v1/workouts${editingId ? `/${editingId}` : ""}`, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: workoutTitle,
        performed_on: performedOn,
        sets: sets.map((set) => ({
          exercise_id: set.exercise_id,
          repetitions: set.repetitions ? Number(set.repetitions) : null,
          weight_kg: set.weight_kg ? Number(set.weight_kg) : null,
          effort_rpe: set.effort_rpe ? Number(set.effort_rpe) : null,
        })),
      }),
    });
    if (!response.ok) {
      setFeedback({ area: "workout", text: t.workout.workoutSaveError });
      return;
    }
    const savedWorkout = (await response.json()) as Workout;
    setWorkouts((current) => {
      const updated = editingId
        ? current.map((workout) => (workout.id === savedWorkout.id ? savedWorkout : workout))
        : [savedWorkout, ...current];
      return updated.sort((a, b) => b.performed_on.localeCompare(a.performed_on));
    });
    const wasEditing = Boolean(editingId);
    const wasDuplicating = duplicating;
    resetForm();
    setFeedback({
      area: "workout",
      text: wasEditing
        ? t.workout.workoutUpdated
        : wasDuplicating
          ? t.workout.duplicateSaved
          : t.workout.workoutSaved,
    });
  }

  async function deleteWorkout(workout: Workout) {
    if (!window.confirm(t.workout.deleteConfirm(workout.title))) return;
    const response = await apiFetch(`/api/v1/workouts/${workout.id}`, { method: "DELETE" });
    if (!response.ok) {
      setFeedback({ area: "history", text: t.workout.deleteError });
      return;
    }
    setWorkouts((current) => current.filter((item) => item.id !== workout.id));
    if (editingId === workout.id) resetForm();
    setFeedback({ area: "history", text: t.workout.deleted });
  }

  return (
    <div className="workspace">
      {feedback?.area === "global" && <p className="message messageGlobal" role="status">{feedback.text || t.workout.loadError}</p>}
      <section className="panel" aria-labelledby="exercise-heading">
        <p className="step">{t.workout.catalogEyebrow}</p>
        <h2 id="exercise-heading">{t.workout.addExercise}</h2>
        <form onSubmit={addExercise}>
          <label>{t.workout.name}<input required minLength={2} value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder={t.workout.exercisePlaceholder} /></label>
          <label>{t.workout.muscleGroup}<input value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)} placeholder={t.workout.musclePlaceholder} /></label>
          <button type="submit">{t.workout.saveExercise}</button>
        </form>
        {feedback?.area === "exercise" && <p className="message" role="status">{feedback.text}</p>}
        <p className="hint">{loading ? t.workout.loading : t.workout.exercisesAvailable(exercises.length)}</p>
      </section>

      <section className="panel panelWide" aria-labelledby="workout-heading">
        <p className="step">{t.workout.workoutEyebrow}</p>
        <h2 id="workout-heading">{editingId ? t.workout.editUnit : duplicating ? t.workout.duplicateUnit : t.workout.captureUnit}</h2>
        <form onSubmit={saveWorkout}>
          <div className="formRow">
            <label>{t.workout.title}<input required minLength={2} value={workoutTitle} onChange={(event) => setWorkoutTitle(event.target.value)} placeholder={t.workout.titlePlaceholder} /></label>
            <label className="formField formFieldDate">{t.workout.date}<input required type="date" value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} /></label>
          </div>
          <div className="setHeader"><span>{t.workout.sets}</span><b>{t.workout.totalLoad}: {totalVolume.toLocaleString(locale)} kg</b></div>
          {sets.map((set, index) => (
            <div className="setRow" key={index}>
              <span className="setNumber">{t.workout.set(index + 1)}</span>
              <label>{t.workout.exercise}<select aria-label={t.workout.exercise} required value={set.exercise_id} onChange={(event) => selectExercise(index, event.target.value)}><option value="">{t.workout.select}</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select>{previousPerformance(set.exercise_id) && <small className="previousPerformance">{t.workout.previous}: {previousPerformance(set.exercise_id)}</small>}</label>
              <label>kg<input type="number" min="0" step="0.25" value={set.weight_kg} onChange={(event) => updateSet(index, "weight_kg", event.target.value)} /></label>
              <label>{t.workout.repetitionsShort}<input type="number" min="1" value={set.repetitions} onChange={(event) => updateSet(index, "repetitions", event.target.value)} /></label>
              <label>RPE<input type="number" min="1" max="10" step="0.5" value={set.effort_rpe} onChange={(event) => updateSet(index, "effort_rpe", event.target.value)} /></label>
              {sets.length > 1 && <button className="iconButton" type="button" aria-label={t.workout.removeSet(index + 1)} onClick={() => setSets((current) => current.filter((_, position) => position !== index))}>×</button>}
            </div>
          ))}
          {feedback?.area === "workout" && <p className="message" role="status">{feedback.text}</p>}
          <div className={`actions${editingId || duplicating ? " actionsExpanded" : ""}`}>
            <button className="secondary" type="button" onClick={() => setSets((current) => [...current, { ...emptySet }])}>{t.workout.addSet}</button>
            <div className="actionGroup">{(editingId || duplicating) && <button className="secondary" type="button" onClick={resetForm}>{t.common.cancel}</button>}<button type="submit">{editingId ? t.workout.saveChanges : t.workout.saveWorkout}</button></div>
          </div>
        </form>
      </section>

      <section className="panel history" aria-labelledby="history-heading">
        <p className="step">{t.workout.historyEyebrow}</p>
        <h2 id="history-heading">{t.workout.history}</h2>
        {feedback?.area === "history" && <p className="message" role="status">{feedback.text}</p>}
        {workouts.length === 0 && !loading ? <p className="emptyState">{t.workout.noWorkouts}</p> : workouts.map((workout) => (
          <article className="historyItem" key={workout.id}>
            <div className="historySummary">
              <div><time dateTime={workout.performed_on}>{new Intl.DateTimeFormat(locale).format(new Date(`${workout.performed_on}T00:00:00`))}</time><h3>{workout.title}</h3><p>{workoutSummary(workout)}</p></div>
              <div className="historyActions"><button className="secondary" type="button" aria-expanded={expandedWorkouts.has(workout.id)} onClick={() => toggleWorkout(workout.id)}>{expandedWorkouts.has(workout.id) ? t.workout.closeDetails : t.workout.showDetails}</button><button className="secondary" type="button" onClick={() => duplicateWorkout(workout)}>{t.workout.duplicate}</button><button className="secondary" type="button" onClick={() => editWorkout(workout)}>{t.workout.edit}</button><button className="danger" type="button" onClick={() => deleteWorkout(workout)}>{t.workout.delete}</button></div>
            </div>
            {expandedWorkouts.has(workout.id) && <div className="workoutDetails"><div className="detailHeader"><span>{t.workout.exercise}</span><span>kg</span><span>{t.workout.repetitionsShort}</span><span>RPE</span></div>{workout.sets.map((set, index) => <div className="detailRow" key={set.id}><span><b>{index + 1}</b>{set.exercise.name}</span><span>{set.weight_kg ? Number(set.weight_kg).toLocaleString(locale) : "–"}</span><span>{set.repetitions ?? "–"}</span><span>{set.effort_rpe ? Number(set.effort_rpe).toLocaleString(locale) : "–"}</span></div>)}</div>}
          </article>
        ))}
      </section>
    </div>
  );
}
