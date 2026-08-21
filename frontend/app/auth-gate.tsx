"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "./api";
import WorkoutLogger from "./workout-logger";

type AuthState = "checking" | "authenticated" | "anonymous" | "registering";

type SessionUser = {
  authenticated: true;
  username: string;
  is_admin: boolean;
};

export default function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [invitationToken, setInvitationToken] = useState(() => typeof window === "undefined"
    ? ""
    : new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch("/api/v1/auth/session")
      .then(async (response) => {
        if (response.ok) {
          setUser((await response.json()) as SessionUser);
          setAuthState("authenticated");
        } else {
          setAuthState(invitationToken ? "registering" : "anonymous");
        }
      })
      .catch(() => {
        setMessage("Die Anwendung ist momentan nicht erreichbar.");
        setAuthState(invitationToken ? "registering" : "anonymous");
      });
  }, [invitationToken]);

  useEffect(() => {
    function readInvitationFromUrl() {
      setInvitationToken(new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "");
    }
    window.addEventListener("hashchange", readInvitationFromUrl);
    return () => window.removeEventListener("hashchange", readInvitationFromUrl);
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
    setUser((await response.json()) as SessionUser);
    setAuthState("authenticated");
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== passwordConfirmation) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }
    const response = await apiFetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_token: invitationToken, username, password }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(response?.status === 409
        ? "Dieser Benutzername ist bereits vergeben."
        : "Die Einladung ist ungültig oder abgelaufen.");
      return;
    }
    setPassword("");
    setPasswordConfirmation("");
    window.history.replaceState({}, "", window.location.pathname);
    setUser((await response.json()) as SessionUser);
    setAuthState("authenticated");
  }

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
    setUsername("");
    setPassword("");
    setPasswordConfirmation("");
    setInvitationUrl("");
    setMessage("");
    setAuthState("anonymous");
  }

  async function createInvitation() {
    setMessage("");
    const response = await apiFetch("/api/v1/auth/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_days: 7 }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Einladung konnte nicht erstellt werden.");
      return;
    }
    const invitation = (await response.json()) as { token: string; expires_at: string };
    setInvitationUrl(`${window.location.origin}/#invite=${encodeURIComponent(invitation.token)}`);
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(invitationUrl);
    setMessage("Einladungslink wurde kopiert.");
  }

  if (authState === "checking") {
    return <main className="authShell"><p className="hint" role="status">Zugriff wird geprüft …</p></main>;
  }

  if (authState === "anonymous" || authState === "registering") {
    const registering = authState === "registering";
    return (
      <main className="authShell">
        <section className="loginPanel" aria-labelledby="login-heading">
          <p className="eyebrow">ATHLETICA LOG</p>
          <h1 id="login-heading">{registering ? "Konto einrichten" : "Anmelden"}</h1>
          <p className="intro">{registering
            ? "Wähle deine persönlichen Zugangsdaten. Die Einladung kann nur einmal verwendet werden."
            : "Melde dich an, um deine Trainingsdaten zu öffnen."}</p>
          <form onSubmit={registering ? register : login}>
            <label>Benutzername<input required minLength={3} maxLength={32} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Passwort<input required minLength={registering ? 12 : 1} type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {registering && <label>Passwort wiederholen<input required minLength={12} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
            {message && <p className="message" role="alert">{message}</p>}
            <button type="submit">{registering ? "Konto erstellen" : "Anmelden"}</button>
          </form>
          {registering && <button className="authAlternative" type="button" onClick={() => setAuthState("anonymous")}>Zur Anmeldung</button>}
        </section>
      </main>
    );
  }

  return (
    <main>
      <nav>
        <strong>Athletica Log</strong>
        <div className="navActions">
          <span className="currentUser">{user?.username}</span>
          {user?.is_admin && <button className="navButton" type="button" onClick={createInvitation}>Tester einladen</button>}
          <button className="navButton" type="button" onClick={logout}>Abmelden</button>
        </div>
      </nav>
      {invitationUrl && <section className="inviteBanner" aria-labelledby="invite-heading">
        <div><p className="step">TESTZUGANG</p><h2 id="invite-heading">Einladung ist 7 Tage gültig</h2></div>
        <label>Einladungslink<input aria-label="Einladungslink" readOnly value={invitationUrl} /></label>
        <div className="actionGroup"><button type="button" onClick={copyInvitation}>Link kopieren</button><button className="secondary" type="button" onClick={() => setInvitationUrl("")}>Schließen</button></div>
      </section>}
      {message && authState === "authenticated" && <p className="message navMessage" role="status">{message}</p>}
      <header>
        <p className="eyebrow">TRAIN. TRACK. PROGRESS.</p>
        <h1>Dein Training.<br />Messbar besser.</h1>
        <p className="intro">Erfasse deine Übungen und speichere deine vollständigen Trainingseinheiten.</p>
      </header>
      <WorkoutLogger />
    </main>
  );
}
