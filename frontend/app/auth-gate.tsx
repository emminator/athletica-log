"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import AccountPanel from "./account-panel";
import { apiFetch } from "./api";
import WorkoutLogger from "./workout-logger";

type AuthState = "checking" | "authenticated" | "anonymous" | "registering" | "resetting";

type SessionUser = {
  authenticated: true;
  username: string;
  is_admin: boolean;
};

function subscribeToHashChange(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function currentHash() {
  return window.location.hash;
}

function serverHash() {
  return "";
}

function clearUrlFragment() {
  window.history.replaceState({}, "", window.location.pathname);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export default function AuthGate() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const hash = useSyncExternalStore(subscribeToHashChange, currentHash, serverHash);
  const hashParameters = new URLSearchParams(hash.slice(1));
  const invitationToken = hashParameters.get("invite") ?? "";
  const resetToken = hashParameters.get("reset") ?? "";
  const [accessLink, setAccessLink] = useState<{ heading: string; label: string; url: string } | null>(null);
  const [message, setMessage] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated || resetToken || authState !== "checking") return;
    apiFetch("/api/v1/auth/session")
      .then(async (response) => {
        if (response.ok) {
          setUser((await response.json()) as SessionUser);
          setAuthState("authenticated");
        } else {
          setAuthState("anonymous");
        }
      })
      .catch(() => {
        setMessage("Die Anwendung ist momentan nicht erreichbar.");
        setAuthState("anonymous");
      });
  }, [authState, hydrated, resetToken]);

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
    clearUrlFragment();
    setUser((await response.json()) as SessionUser);
    setAuthState("authenticated");
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== passwordConfirmation) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }
    const response = await apiFetch("/api/v1/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset_token: resetToken, new_password: password }),
    }).catch(() => null);
    if (!response?.ok) {
      const error = response ? await response.json().catch(() => null) as { detail?: string } | null : null;
      setMessage(error?.detail === "New password must be different"
        ? "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden."
        : "Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.");
      return;
    }
    await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
    setPassword("");
    setPasswordConfirmation("");
    clearUrlFragment();
    setMessage("Passwort geändert. Du kannst dich jetzt anmelden.");
    setAuthState("anonymous");
  }

  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
    setUsername("");
    setPassword("");
    setPasswordConfirmation("");
    setAccessLink(null);
    setAccountOpen(false);
    setMessage("");
    setAuthState("anonymous");
  }

  function passwordChanged(passwordMessage: string) {
    setUser(null);
    setUsername("");
    setPassword("");
    setPasswordConfirmation("");
    setAccessLink(null);
    setAccountOpen(false);
    setMessage(passwordMessage);
    setAuthState("anonymous");
  }

  async function copyAccessLink() {
    if (!accessLink) return;
    await navigator.clipboard.writeText(accessLink.url);
    setMessage(`${accessLink.label} wurde kopiert.`);
  }

  const visibleAuthState: AuthState = !hydrated
    ? "checking"
    : resetToken
      ? "resetting"
      : invitationToken && authState !== "authenticated"
        ? "registering"
        : authState;

  if (visibleAuthState === "checking") {
    return <main className="authShell"><p className="hint" role="status">Zugriff wird geprüft …</p></main>;
  }

  if (visibleAuthState === "anonymous" || visibleAuthState === "registering" || visibleAuthState === "resetting") {
    const registering = visibleAuthState === "registering";
    const resetting = visibleAuthState === "resetting";
    return (
      <main className="authShell">
        <section className="loginPanel" aria-labelledby="login-heading">
          <p className="eyebrow">ATHLETICA LOG</p>
          <h1 id="login-heading">{registering ? "Konto einrichten" : resetting ? "Passwort zurücksetzen" : "Anmelden"}</h1>
          <p className="intro">{registering
            ? "Wähle deine persönlichen Zugangsdaten. Die Einladung kann nur einmal verwendet werden."
            : resetting
              ? "Wähle ein neues Passwort. Der Link kann nur einmal verwendet werden."
            : "Melde dich an, um deine Trainingsdaten zu öffnen."}</p>
          <form onSubmit={registering ? register : resetting ? resetPassword : login}>
            {!resetting && <label>Benutzername<input required minLength={3} maxLength={32} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>}
            <label>{resetting ? "Neues Passwort" : "Passwort"}<input required minLength={registering || resetting ? 12 : 1} type="password" autoComplete={registering || resetting ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {(registering || resetting) && <label>{resetting ? "Neues Passwort wiederholen" : "Passwort wiederholen"}<input required minLength={12} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
            {message && <p className="message" role="alert">{message}</p>}
            <button type="submit">{registering ? "Konto erstellen" : resetting ? "Passwort speichern" : "Anmelden"}</button>
          </form>
          {(registering || resetting) && <button className="authAlternative" type="button" onClick={async () => {
            if (resetting) await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
            clearUrlFragment();
            setMessage("");
            setAuthState("anonymous");
          }}>Zur Anmeldung</button>}
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
          <button className="navButton" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>Konto</button>
          <button className="navButton" type="button" onClick={logout}>Abmelden</button>
        </div>
      </nav>
      {accountOpen && user && <AccountPanel
        user={user}
        onClose={() => setAccountOpen(false)}
        onAccessLink={(link) => setAccessLink(link)}
        onPasswordChanged={passwordChanged}
      />}
      {accessLink && <section className="inviteBanner" aria-labelledby="access-link-heading">
        <div><p className="step">SICHERER LINK</p><h2 id="access-link-heading">{accessLink.heading}</h2></div>
        <label>{accessLink.label}<input aria-label={accessLink.label} readOnly value={accessLink.url} /></label>
        <div className="actionGroup"><button type="button" onClick={copyAccessLink}>Link kopieren</button><button className="secondary" type="button" onClick={() => setAccessLink(null)}>Schließen</button></div>
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
