import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { viewport } from "./layout";
import Home from "./page";

describe("Home", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/auth/session")
        ? { authenticated: true, username: "athletica", is_admin: false }
        : [],
    })));
  });

  it("presents the workout logger", async () => {
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(screen.getByText("Satz 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Training speichern" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trainingshistorie" })).toBeInTheDocument();
  });

  it("switches the complete interface to English and remembers the preference", async () => {
    const { unmount } = render(<Home />);
    await screen.findByRole("heading", { name: "Einheit erfassen" });

    fireEvent.click(screen.getByRole("button", { name: "Englisch" }));

    expect(await screen.findByRole("heading", { name: "Log session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save workout" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Training history" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(window.localStorage.getItem("athletica-language")).toBe("en");

    unmount();
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Log session" })).toBeInTheDocument();
  });

  it("starts mobile pages at the device width without zoom", () => {
    expect(viewport).toEqual({ width: "device-width", initialScale: 1 });
  });

  it("prefills the last performance when an exercise is selected", async () => {
    const exercise = { id: "exercise-1", name: "Kniebeuge", muscle_group: "Beine", activity_type: "strength" };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/auth/session")
        ? { authenticated: true, username: "athletica", is_admin: false }
        : url.endsWith("/exercises") ? [exercise] : [{
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

  it("only shows a total load in history when weighted repetitions exist", async () => {
    const tennis = { id: "exercise-1", name: "Tennis", muscle_group: null, activity_type: "other" };
    const squat = { id: "exercise-2", name: "Kniebeuge", muscle_group: "Beine", activity_type: "strength" };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.endsWith("/auth/session")
        ? { authenticated: true, username: "athletica", is_admin: false }
        : url.endsWith("/exercises") ? [tennis, squat] : [
        {
          id: "workout-1",
          title: "Tennis",
          performed_on: "2026-08-03",
          notes: null,
          sets: [{ id: "set-1", exercise_id: tennis.id, exercise: tennis, repetitions: null, weight_kg: null, effort_rpe: "7" }],
        },
        {
          id: "workout-2",
          title: "Beine",
          performed_on: "2026-08-02",
          notes: null,
          sets: [{ id: "set-2", exercise_id: squat.id, exercise: squat, repetitions: 8, weight_kg: "80", effort_rpe: "8" }],
        },
      ],
    })));

    render(<Home />);

    const historyRegion = await screen.findByRole("region", { name: "Trainingshistorie" });
    expect(await within(historyRegion).findByText("1 Satz · Tennis")).toBeInTheDocument();
    expect(within(historyRegion).queryByText("0 kg Volumen", { exact: false })).not.toBeInTheDocument();
    expect(within(historyRegion).getByText("1 Satz · Gesamtlast: 640 kg · Kniebeuge")).toBeInTheDocument();
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
      if (url.endsWith("/auth/session")) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "athletica", is_admin: false }) });
      }
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
    expect(screen.getByLabelText("Datum").closest("label"))
      .toHaveClass("formField", "formFieldDate");
    expect(screen.getByRole("button", { name: "Training speichern" }).closest(".actions"))
      .toHaveClass("actionsExpanded");
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

  it("shows workout save errors next to the workout form", async () => {
    const exercise = { id: "exercise-1", name: "Kniebeuge", muscle_group: "Beine", activity_type: "strength" };
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => Promise.resolve({
      ok: url.endsWith("/auth/session") || options?.method !== "POST",
      status: options?.method === "POST" ? 422 : 200,
      json: async () => url.endsWith("/auth/session")
        ? { authenticated: true, username: "athletica", is_admin: false }
        : url.endsWith("/exercises") ? [exercise] : [],
    })));

    render(<Home />);
    await screen.findByRole("option", { name: "Kniebeuge" });
    fireEvent.change(screen.getByRole("textbox", { name: "Titel" }), { target: { value: "Beine" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Übung" }), { target: { value: exercise.id } });
    fireEvent.click(screen.getByRole("button", { name: "Training speichern" }));

    const message = await screen.findByRole("status");
    const workoutRegion = screen.getByRole("region", { name: "Einheit erfassen" });
    const historyRegion = screen.getByRole("region", { name: "Trainingshistorie" });
    expect(within(workoutRegion).getByRole("status")).toBe(message);
    expect(within(historyRegion).queryByRole("status")).not.toBeInTheDocument();
    expect(message).toHaveTextContent("Training konnte nicht gespeichert werden. Bitte prüfe alle Felder.");
  });

  it("requires a successful login before showing training data", async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) return Promise.resolve({ ok: false, status: 401 });
      if (url.endsWith("/auth/login") && options?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "athletica", is_admin: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Benutzername" }), { target: { value: "athletica" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "a-strong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/login", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
  });

  it("creates an account from a one-time invitation", async () => {
    window.history.replaceState({}, "", "/#invite=invitation-token-with-enough-characters-123");
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) return Promise.resolve({ ok: false, status: 401 });
      if (url.endsWith("/auth/register") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ authenticated: true, username: "tester", is_admin: false }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Konto einrichten" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Benutzername" }), { target: { value: "tester" } });
    fireEvent.change(screen.getByLabelText("Passwort", { exact: true }), { target: { value: "tester-password-123" } });
    fireEvent.change(screen.getByLabelText("Passwort wiederholen"), { target: { value: "tester-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Konto erstellen" }));

    expect(await screen.findByRole("heading", { name: "Einheit erfassen" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        invitation_token: "invitation-token-with-enough-characters-123",
        username: "tester",
        password: "tester-password-123",
      }),
    }));
  });

  it("explains invalid usernames before creating an account", async () => {
    window.history.replaceState({}, "", "/#invite=invitation-token-with-enough-characters-789");
    const fetchMock = vi.fn((url: string) => Promise.resolve({
      ok: !url.endsWith("/auth/session"),
      status: url.endsWith("/auth/session") ? 401 : 200,
      json: async () => [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Konto einrichten" })).toBeInTheDocument();
    expect(screen.getByText(/3–32 Zeichen.*beginnt mit Kleinbuchstabe oder Zahl.*Punkt, _ und -/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Benutzername" }), { target: { value: "Neuer Tester" } });
    fireEvent.change(screen.getByLabelText("Passwort", { exact: true }), { target: { value: "tester-password-123" } });
    fireEvent.change(screen.getByLabelText("Passwort wiederholen"), { target: { value: "tester-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Konto erstellen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("verwende nur Kleinbuchstaben, Zahlen, Punkt, _ oder -");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/register"))).toBe(false);
  });

  it("explains invalid usernames before attempting login", async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve({
      ok: false,
      status: url.endsWith("/auth/session") ? 401 : 422,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Englisch" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "new%tester" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-strong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("use only lowercase letters, numbers, periods, underscores, or hyphens");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/login"))).toBe(false);
  });

  it("opens registration when an invitation is pasted after the login page loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 401 })));

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();

    window.history.replaceState({}, "", "/#invite=invitation-token-with-enough-characters-456");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByRole("heading", { name: "Konto einrichten" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Benutzername" })).toHaveValue("");
  });

  it("lets an administrator create a tester invitation", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => Promise.resolve({
      ok: true,
      status: options?.method === "POST" ? 201 : 200,
      json: async () => url.endsWith("/auth/session")
        ? { authenticated: true, username: "owner", is_admin: true }
        : url.endsWith("/auth/invitations") && options?.method === "POST"
          ? { token: "new-invitation-token", expires_at: "2026-08-27T12:00:00Z" }
          : [],
    })));

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Konto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tester einladen" }));

    expect(await screen.findByRole("heading", { name: "Einladung ist 7 Tage gültig" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Einladungslink" })).toHaveValue(
      "http://localhost:3000/#invite=new-invitation-token",
    );
  });

  it("lists and revokes open tester invitations", async () => {
    const invitation = {
      id: "invitation-id",
      created_at: "2026-08-21T12:00:00Z",
      expires_at: "2026-08-28T12:00:00Z",
    };
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "owner", is_admin: true }) });
      }
      if (url.endsWith("/auth/invitations") && !options?.method) {
        return Promise.resolve({ ok: true, json: async () => [invitation] });
      }
      if (url.endsWith("/auth/invitations/invitation-id") && options?.method === "DELETE") {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Konto" }));
    expect(await screen.findByText("Tester-Einladung")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Widerrufen" }));

    expect(await screen.findByText("Keine offenen Einladungen.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Die Einladung wurde widerrufen.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/invitations/invitation-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates a one-time password reset link for a tester", async () => {
    const owner = { id: "owner-id", username: "owner", is_admin: true, is_active: true, created_at: "2026-08-20T12:00:00Z" };
    const tester = { id: "tester-id", username: "tester", is_admin: false, is_active: true, created_at: "2026-08-21T12:00:00Z" };
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "owner", is_admin: true }) });
      }
      if (url.endsWith("/auth/users")) {
        return Promise.resolve({ ok: true, json: async () => [owner, tester] });
      }
      if (url.endsWith("/auth/users/tester-id/password-resets") && options?.method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ token: "reset-token", expires_at: "2026-08-21T13:00:00Z" }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Konto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Passwort zurücksetzen" }));

    expect(await screen.findByRole("heading", { name: "Passwort-Reset für tester · 1 Stunde gültig" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Reset-Link" })).toHaveValue(
      "http://localhost:3000/#reset=reset-token",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/users/tester-id/password-resets",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ expires_in_hours: 1 }) }),
    );
  });

  it("sets a new password from a one-time reset link", async () => {
    window.history.replaceState({}, "", "/#reset=password-reset-token-with-enough-characters-123");
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/password-reset") && options?.method === "POST") {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: false, status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Passwort zurücksetzen" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Neues Passwort", { exact: true }), { target: { value: "new-password-456" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), { target: { value: "new-password-456" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Passwort geändert. Du kannst dich jetzt anmelden.");
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/password-reset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reset_token: "password-reset-token-with-enough-characters-123",
          new_password: "new-password-456",
        }),
      }),
    );
  });

  it("keeps server and client markup stable for password reset links", () => {
    window.history.replaceState({}, "", "/#reset=password-reset-token-with-enough-characters-789");

    const serverMarkup = renderToString(<Home />);

    expect(serverMarkup).toContain("Zugriff wird geprüft");
    expect(serverMarkup).not.toContain("Passwort zurücksetzen");
  });

  it("explains when a reset password matches the previous password", async () => {
    window.history.replaceState({}, "", "/#reset=password-reset-token-with-enough-characters-456");
    vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/password-reset") && options?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ detail: "New password must be different" }),
        });
      }
      return Promise.resolve({ ok: false, status: 401 });
    }));

    render(<Home />);
    fireEvent.change(await screen.findByLabelText("Neues Passwort", { exact: true }), { target: { value: "existing-password-123" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), { target: { value: "existing-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.",
    );
  });

  it("changes the password and returns to login", async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "tester", is_admin: false }) });
      }
      if (url.endsWith("/auth/password") && options?.method === "POST") {
        return Promise.resolve({ ok: true, status: 204 });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Konto" }));
    fireEvent.change(screen.getByLabelText("Aktuelles Passwort"), { target: { value: "old-password-123" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort", { exact: true }), { target: { value: "new-password-456" } });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), { target: { value: "new-password-456" } });
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));

    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Passwort geändert. Bitte melde dich erneut an.");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/password", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ current_password: "old-password-123", new_password: "new-password-456" }),
    }));
  });

  it("lets an administrator deactivate a tester", async () => {
    const owner = { id: "owner-id", username: "owner", is_admin: true, is_active: true, created_at: "2026-08-20T12:00:00Z" };
    const tester = { id: "tester-id", username: "tester", is_admin: false, is_active: true, created_at: "2026-08-21T12:00:00Z" };
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/auth/session")) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: true, username: "owner", is_admin: true }) });
      }
      if (url.endsWith("/auth/users")) {
        return Promise.resolve({ ok: true, json: async () => [owner, tester] });
      }
      if (url.endsWith("/auth/users/tester-id") && options?.method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => ({ ...tester, is_active: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Konto" }));
    expect(await screen.findByText("tester")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deaktivieren" }));

    expect(await screen.findByRole("button", { name: "Aktivieren" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("tester wurde deaktiviert und abgemeldet.");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/auth/users/tester-id", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    }));
  });
});
