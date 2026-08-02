import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

describe("Home", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });

  it("presents the workout logger", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Training speichern" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trainingshistorie" })).toBeInTheDocument();
  });

  it("prefills the last performance when an exercise is selected", async () => {
    const exercise = { id: "exercise-1", name: "Kniebeuge", muscle_group: "Beine", activity_type: "strength" };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/exercises") ? [exercise] : [{
        id: "workout-1",
        title: "Beine",
        performed_on: "2026-08-01",
        notes: null,
        sets: [{
          id: "set-1",
          exercise_id: exercise.id,
          exercise,
          repetitions: 8,
          weight_kg: "80",
          effort_rpe: "8.5",
        }],
      }],
    })));

    render(<Home />);
    await screen.findByRole("option", { name: "Kniebeuge" });
    fireEvent.change(screen.getByRole("combobox", { name: "Übung" }), { target: { value: exercise.id } });

    expect(screen.getByRole("spinbutton", { name: "kg" })).toHaveValue(80);
    expect(screen.getByRole("spinbutton", { name: "Wdh." })).toHaveValue(8);
    expect(screen.getByRole("spinbutton", { name: "RPE" })).toHaveValue(8.5);
    expect(screen.getByText("Zuletzt: 80 kg × 8 Wdh.")).toBeInTheDocument();
  });

  it("duplicates a past workout into an editable new workout for today", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-02T12:00:00+02:00"));
    Element.prototype.scrollIntoView = vi.fn();

    const squat = { id: "exercise-1", name: "Kniebeuge", muscle_group: "Beine", activity_type: "strength" };
    const row = { id: "exercise-2", name: "Rudern", muscle_group: "Rücken", activity_type: "strength" };
    const workout = {
      id: "workout-1",
      title: "Ganzkörper A",
      performed_on: "2026-07-30",
      notes: null,
      sets: [
        { id: "set-1", exercise_id: squat.id, exercise: squat, repetitions: 8, weight_kg: "80", effort_rpe: "8.5" },
        { id: "set-2", exercise_id: row.id, exercise: row, repetitions: 10, weight_kg: "60", effort_rpe: "8" },
      ],
    };
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ ...workout, id: "workout-2", performed_on: "2026-08-02" }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => url.endsWith("/exercises") ? [squat, row] : [workout],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    await screen.findByRole("heading", { name: "Ganzkörper A" });
    fireEvent.click(screen.getByRole("button", { name: "Duplizieren" }));

    expect(screen.getByRole("heading", { name: "Einheit duplizieren" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Titel" })).toHaveValue("Ganzkörper A");
    expect(screen.getByLabelText("Datum")).toHaveValue("2026-08-02");
    expect(screen.getAllByRole("combobox", { name: "Übung" }).map((field) => (field as HTMLSelectElement).value)).toEqual([squat.id, row.id]);
    expect(screen.getAllByRole("spinbutton", { name: "kg" }).map((field) => (field as HTMLInputElement).value)).toEqual(["80", "60"]);
    expect(screen.getAllByRole("spinbutton", { name: "Wdh." }).map((field) => (field as HTMLInputElement).value)).toEqual(["8", "10"]);
    expect(screen.getAllByRole("spinbutton", { name: "RPE" }).map((field) => (field as HTMLInputElement).value)).toEqual(["8.5", "8"]);

    fireEvent.change(screen.getByRole("textbox", { name: "Titel" }), { target: { value: "Ganzkörper B" } });
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "kg" })[0], { target: { value: "82.5" } });
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "Wdh." })[1], { target: { value: "12" } });
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "RPE" })[0], { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Training speichern" }));

    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8000/api/v1/workouts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        title: "Ganzkörper B",
        performed_on: "2026-08-02",
        sets: [
          { exercise_id: squat.id, repetitions: 8, weight_kg: 82.5, effort_rpe: 9 },
          { exercise_id: row.id, repetitions: 12, weight_kg: 60, effort_rpe: 8 },
        ],
      }),
    }));
  }, 15_000);
});
