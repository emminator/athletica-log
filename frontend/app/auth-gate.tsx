"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "./api";
import WorkoutLogger from "./workout-logger";

type AuthState = "checking" | "authenticated" | "anonymous";

export default function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState("athletica");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch("/api/v1/auth/session")
      .then((response) => setAuthState(response.ok ? "authenticated" : "anonymous"))
      .catch(() => {
        setMessage("Die Anwendung ist momentan nicht erreichbar.");
        setAuthState("anonymous");
      });
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Benutzername oder Passwort ist nicht korrekt.");
      return;
    }
    setPassword("");
    setAuthState("authenticated");
  }

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setAuthState("anonymous");
  }

  if (authState === "checking") {
    return <main className="authShell"><p className="hint" role="status">Zugriff wird geprüft …</p></main>;
  }

  if (authState === "anonymous") {
    return (
      <main className="authShell">
        <section className="loginPanel" aria-labelledby="login-heading">
          <p className="eyebrow">ATHLETICA LOG</p>
          <h1 id="login-heading">Anmelden</h1>
          <p className="intro">Melde dich an, um deine Trainingsdaten zu öffnen.</p>
          <form onSubmit={login}>
            <label>Benutzername<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Passwort<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {message && <p className="message" role="alert">{message}</p>}
            <button type="submit">Anmelden</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <strong>Athletica Log</strong>
        <div className="navActions"><span>Übersicht&nbsp;&nbsp; Training&nbsp;&nbsp; Planung</span><button className="navButton" type="button" onClick={logout}>Abmelden</button></div>
      </nav>
      <header>
        <p className="eyebrow">TRAIN. TRACK. PROGRESS.</p>
        <h1>Dein Training.<br />Messbar besser.</h1>
        <p className="intro">Erfasse deine Übungen und speichere deine vollständigen Trainingseinheiten.</p>
      </header>
      <WorkoutLogger />
    </main>
  );
}
