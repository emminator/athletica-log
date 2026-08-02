"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const emptySet: DraftSet = { exercise_id: "", repetitions: "", weight_kg: "", effort_rpe: "" };

export default function WorkoutLogger() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [performedOn, setPerformedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [sets, setSets] = useState<DraftSet[]>([{ ...emptySet }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/v1/exercises`),
      fetch(`${apiUrl}/api/v1/workouts`),
    ])
      .then(async ([exerciseResponse, workoutResponse]) => {
        if (!exerciseResponse.ok || !workoutResponse.ok) throw new Error("Daten konnten nicht geladen werden.");
        const [exerciseData, workoutData] = await Promise.all([
          exerciseResponse.json() as Promise<Exercise[]>,
          workoutResponse.json() as Promise<Workout[]>,
        ]);
        setExercises(exerciseData);
        setWorkouts(workoutData);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  const totalVolume = useMemo(
    () => sets.reduce((sum, set) => sum + Number(set.weight_kg || 0) * Number(set.repetitions || 0), 0),
    [sets],
  );

  async function addExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${apiUrl}/api/v1/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: exerciseName, muscle_group: muscleGroup || null, activity_type: "strength" }),
    });
    if (!response.ok) {
      setMessage(response.status === 409 ? "Diese Übung existiert bereits." : "Übung konnte nicht gespeichert werden.");
      return;
    }
    const exercise = (await response.json()) as Exercise;
    setExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name, "de")));
    setSets((current) => current.map((set) => (set.exercise_id ? set : { ...set, exercise_id: exercise.id })));
    setExerciseName("");
    setMuscleGroup("");
    setMessage(`„${exercise.name}“ wurde hinzugefügt.`);
  }

  function updateSet(index: number, field: keyof DraftSet, value: string) {
    setSets((current) => current.map((set, position) => (position === index ? { ...set, [field]: value } : set)));
  }

  function resetForm() {
    setEditingId(null);
    setWorkoutTitle("");
    setPerformedOn(new Date().toISOString().slice(0, 10));
    setSets([{ ...emptySet }]);
  }

  function editWorkout(workout: Workout) {
    setEditingId(workout.id);
    setWorkoutTitle(workout.title);
    setPerformedOn(workout.performed_on);
    setSets(workout.sets.map((set) => ({
      exercise_id: set.exercise_id,
      repetitions: set.repetitions?.toString() ?? "",
      weight_kg: set.weight_kg ?? "",
      effort_rpe: set.effort_rpe ?? "",
    })));
    setMessage(`„${workout.title}“ wird bearbeitet.`);
    document.getElementById("workout-heading")?.scrollIntoView({ behavior: "smooth" });
  }

  async function saveWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${apiUrl}/api/v1/workouts${editingId ? `/${editingId}` : ""}`, {
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
      setMessage("Training konnte nicht gespeichert werden. Bitte prüfe alle Felder.");
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
    resetForm();
    setMessage(wasEditing ? "Training erfolgreich aktualisiert." : "Training erfolgreich gespeichert.");
  }

  async function deleteWorkout(workout: Workout) {
    if (!window.confirm(`„${workout.title}“ wirklich löschen?`)) return;
    const response = await fetch(`${apiUrl}/api/v1/workouts/${workout.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Training konnte nicht gelöscht werden.");
      return;
    }
    setWorkouts((current) => current.filter((item) => item.id !== workout.id));
    if (editingId === workout.id) resetForm();
    setMessage("Training wurde gelöscht.");
  }

  return (
    <div className="workspace">
      <section className="panel" aria-labelledby="exercise-heading">
        <p className="step">01 · ÜBUNGSKATALOG</p>
        <h2 id="exercise-heading">Übung hinzufügen</h2>
        <form onSubmit={addExercise}>
          <label>Name<input required minLength={2} value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="z. B. Kniebeuge" /></label>
          <label>Muskelgruppe<input value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)} placeholder="z. B. Beine" /></label>
          <button type="submit">Übung speichern</button>
        </form>
        <p className="hint">{loading ? "Daten werden geladen …" : `${exercises.length} Übungen verfügbar`}</p>
      </section>

      <section className="panel panelWide" aria-labelledby="workout-heading">
        <p className="step">02 · TRAINING</p>
        <h2 id="workout-heading">{editingId ? "Einheit bearbeiten" : "Einheit erfassen"}</h2>
        <form onSubmit={saveWorkout}>
          <div className="formRow">
            <label>Titel<input required minLength={2} value={workoutTitle} onChange={(event) => setWorkoutTitle(event.target.value)} placeholder="z. B. Unterkörper A" /></label>
            <label>Datum<input required type="date" value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} /></label>
          </div>
          <div className="setHeader"><span>Sätze</span><b>{totalVolume.toLocaleString("de-DE")} kg Volumen</b></div>
          {sets.map((set, index) => (
            <div className="setRow" key={index}>
              <span className="setNumber">{index + 1}</span>
              <label>Übung<select required value={set.exercise_id} onChange={(event) => updateSet(index, "exercise_id", event.target.value)}><option value="">Auswählen</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
              <label>kg<input type="number" min="0" step="0.25" value={set.weight_kg} onChange={(event) => updateSet(index, "weight_kg", event.target.value)} /></label>
              <label>Wdh.<input type="number" min="1" value={set.repetitions} onChange={(event) => updateSet(index, "repetitions", event.target.value)} /></label>
              <label>RPE<input type="number" min="1" max="10" step="0.5" value={set.effort_rpe} onChange={(event) => updateSet(index, "effort_rpe", event.target.value)} /></label>
              {sets.length > 1 && <button className="iconButton" type="button" aria-label={`Satz ${index + 1} entfernen`} onClick={() => setSets((current) => current.filter((_, position) => position !== index))}>×</button>}
            </div>
          ))}
          <div className="actions">
            <button className="secondary" type="button" onClick={() => setSets((current) => [...current, { ...emptySet }])}>+ Satz</button>
            <div className="actionGroup">{editingId && <button className="secondary" type="button" onClick={resetForm}>Abbrechen</button>}<button type="submit" disabled={exercises.length === 0}>{editingId ? "Änderungen speichern" : "Training speichern"}</button></div>
          </div>
        </form>
      </section>

      <section className="panel history" aria-labelledby="history-heading">
        <p className="step">03 · VERLAUF</p>
        <h2 id="history-heading">Trainingshistorie</h2>
        {workouts.length === 0 && !loading ? <p className="emptyState">Noch keine Trainings gespeichert.</p> : workouts.map((workout) => (
          <article className="historyItem" key={workout.id}>
            <div><time dateTime={workout.performed_on}>{new Intl.DateTimeFormat("de-DE").format(new Date(`${workout.performed_on}T00:00:00`))}</time><h3>{workout.title}</h3><p>{workout.sets.length} Sätze · {workout.sets.map((set) => set.exercise.name).filter((name, index, names) => names.indexOf(name) === index).join(", ")}</p></div>
            <div className="historyActions"><button className="secondary" type="button" onClick={() => editWorkout(workout)}>Bearbeiten</button><button className="danger" type="button" onClick={() => deleteWorkout(workout)}>Löschen</button></div>
          </article>
        ))}
      </section>
      {message && <p className="message" role="status">{message}</p>}
    </div>
  );
}
