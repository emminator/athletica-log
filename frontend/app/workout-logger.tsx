"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  activity_type: "strength" | "cardio" | "mobility" | "other";
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
  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [performedOn, setPerformedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [sets, setSets] = useState<DraftSet[]>([{ ...emptySet }]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/api/v1/exercises`)
      .then((response) => {
        if (!response.ok) throw new Error("Übungen konnten nicht geladen werden.");
        return response.json() as Promise<Exercise[]>;
      })
      .then(setExercises)
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

  async function saveWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${apiUrl}/api/v1/workouts`, {
      method: "POST",
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
    setWorkoutTitle("");
    setSets([{ ...emptySet }]);
    setMessage("Training erfolgreich gespeichert.");
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
        <p className="hint">{loading ? "Übungen werden geladen …" : `${exercises.length} Übungen verfügbar`}</p>
      </section>

      <section className="panel panelWide" aria-labelledby="workout-heading">
        <p className="step">02 · TRAINING</p>
        <h2 id="workout-heading">Einheit erfassen</h2>
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
          <div className="actions"><button className="secondary" type="button" onClick={() => setSets((current) => [...current, { ...emptySet }])}>+ Satz</button><button type="submit" disabled={exercises.length === 0}>Training speichern</button></div>
        </form>
      </section>
      {message && <p className="message" role="status">{message}</p>}
    </div>
  );
}

