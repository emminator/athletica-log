import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

describe("Home", () => {
  afterEach(() => cleanup());
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
});
