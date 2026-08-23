"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import AccountPanel from "./account-panel";
import { apiFetch } from "./api";
import { LanguageSwitcher, useLanguage } from "./language";
import { isValidUsername, normalizeUsername } from "./username";
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
  const { t } = useLanguage();
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
        setMessage(t.auth.unavailable);
        setAuthState("anonymous");
      });
  }, [authState, hydrated, resetToken, t.auth.unavailable]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!isValidUsername(username)) {
      setMessage(t.auth.invalidUsername);
      return;
    }
    const normalizedUsername = normalizeUsername(username);
    const response = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: normalizedUsername, password }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(t.auth.invalidLogin);
      return;
    }
    setPassword("");
    setUser((await response.json()) as SessionUser);
    setAuthState("authenticated");
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!isValidUsername(username)) {
      setMessage(t.auth.invalidUsername);
      return;
    }
    if (password !== passwordConfirmation) {
      setMessage(t.auth.passwordsMismatch);
      return;
    }
    const normalizedUsername = normalizeUsername(username);
    const response = await apiFetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_token: invitationToken, username: normalizedUsername, password }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(response?.status === 409
        ? t.auth.usernameTaken
        : t.auth.invalidInvitation);
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
      setMessage(t.auth.passwordsMismatch);
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
        ? t.auth.samePassword
        : t.auth.invalidReset);
      return;
    }
    await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
    setPassword("");
    setPasswordConfirmation("");
    clearUrlFragment();
    setMessage(t.auth.resetSuccess);
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
    setMessage(t.auth.copied(accessLink.label));
  }

  const visibleAuthState: AuthState = !hydrated
    ? "checking"
    : resetToken
      ? "resetting"
      : invitationToken && authState !== "authenticated"
        ? "registering"
        : authState;

  if (visibleAuthState === "checking") {
    return <main className="authShell"><p className="hint" role="status">{t.auth.checking}</p></main>;
  }

  if (visibleAuthState === "anonymous" || visibleAuthState === "registering" || visibleAuthState === "resetting") {
    const registering = visibleAuthState === "registering";
    const resetting = visibleAuthState === "resetting";
    return (
      <main className="authShell">
        <section className="loginPanel" aria-labelledby="login-heading">
          <LanguageSwitcher />
          <p className="eyebrow">ATHLETICA LOG</p>
          <h1 id="login-heading">{registering ? t.auth.setupAccount : resetting ? t.auth.resetPassword : t.auth.signIn}</h1>
          <p className="intro">{registering
            ? t.auth.registerIntro
            : resetting
              ? t.auth.resetIntro
            : t.auth.signInIntro}</p>
          <form onSubmit={registering ? register : resetting ? resetPassword : login}>
            {!resetting && <div className="authField">
              <label htmlFor="username">{t.auth.username}<input id="username" required maxLength={32} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-describedby="username-requirements" value={username} onChange={(event) => {
                setUsername(event.target.value);
                if (message === t.auth.invalidUsername) setMessage("");
              }} /></label>
              <span className="fieldHint" id="username-requirements">{t.auth.usernameRequirements}</span>
            </div>}
            <label>{resetting ? t.auth.newPassword : t.auth.password}<input required minLength={registering || resetting ? 12 : 1} type="password" autoComplete={registering || resetting ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {(registering || resetting) && <label>{resetting ? t.auth.repeatNewPassword : t.auth.repeatPassword}<input required minLength={12} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>}
            {message && <p className="message" role="alert">{message}</p>}
            <button type="submit">{registering ? t.auth.createAccount : resetting ? t.auth.savePassword : t.auth.signIn}</button>
          </form>
          {(registering || resetting) && <button className="authAlternative" type="button" onClick={async () => {
            if (resetting) await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
            clearUrlFragment();
            setMessage("");
            setAuthState("anonymous");
          }}>{t.auth.backToSignIn}</button>}
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
          <LanguageSwitcher />
          <button className="navButton" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((open) => !open)}>{t.auth.account}</button>
          <button className="navButton" type="button" onClick={logout}>{t.auth.signOut}</button>
        </div>
      </nav>
      {accountOpen && user && <AccountPanel
        user={user}
        onClose={() => setAccountOpen(false)}
        onAccessLink={(link) => setAccessLink(link)}
        onPasswordChanged={passwordChanged}
      />}
      {accessLink && <section className="inviteBanner" aria-labelledby="access-link-heading">
        <div><p className="step">{t.auth.secureLink}</p><h2 id="access-link-heading">{accessLink.heading}</h2></div>
        <label>{accessLink.label}<input aria-label={accessLink.label} readOnly value={accessLink.url} /></label>
        <div className="actionGroup"><button type="button" onClick={copyAccessLink}>{t.auth.copyLink}</button><button className="secondary" type="button" onClick={() => setAccessLink(null)}>{t.common.close}</button></div>
      </section>}
      {message && authState === "authenticated" && <p className="message navMessage" role="status">{message}</p>}
      <header>
        <p className="eyebrow">TRAIN. TRACK. PROGRESS.</p>
        <h1>{t.auth.hero}<br />{t.auth.heroAccent}</h1>
        <p className="intro">{t.auth.heroIntro}</p>
      </header>
      <WorkoutLogger />
    </main>
  );
}
