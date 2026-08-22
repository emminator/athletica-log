"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "./api";

type SessionUser = {
  authenticated: true;
  username: string;
  is_admin: boolean;
};

type ManagedUser = {
  id: string;
  username: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};

type AccountPanelProps = {
  user: SessionUser;
  onClose: () => void;
  onCreateInvitation: () => Promise<void>;
  onPasswordChanged: (message: string) => void;
};

export default function AccountPanel({
  user,
  onClose,
  onCreateInvitation,
  onPasswordChanged,
}: AccountPanelProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [message, setMessage] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(user.is_admin);
  const [busyUserId, setBusyUserId] = useState("");

  useEffect(() => {
    if (!user.is_admin) return;
    let active = true;
    apiFetch("/api/v1/auth/users")
      .then(async (response) => {
        if (!response.ok) throw new Error("users unavailable");
        const users = (await response.json()) as ManagedUser[];
        if (active) setManagedUsers(users);
      })
      .catch(() => {
        if (active) setMessage("Die Konten konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, [user.is_admin]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== passwordConfirmation) {
      setMessage("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    const response = await apiFetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(response?.status === 400
        ? "Prüfe das aktuelle Passwort und verwende ein neues Passwort."
        : "Das Passwort konnte nicht geändert werden.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    onPasswordChanged("Passwort geändert. Bitte melde dich erneut an.");
  }

  async function updateUser(managedUser: ManagedUser) {
    setMessage("");
    setBusyUserId(managedUser.id);
    const response = await apiFetch(`/api/v1/auth/users/${managedUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !managedUser.is_active }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Der Kontostatus konnte nicht geändert werden.");
      setBusyUserId("");
      return;
    }
    const updated = (await response.json()) as ManagedUser;
    setManagedUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setMessage(updated.is_active
      ? `${updated.username} wurde aktiviert.`
      : `${updated.username} wurde deaktiviert und abgemeldet.`);
    setBusyUserId("");
  }

  return (
    <section className="accountPanel" aria-labelledby="account-heading">
      <div className="accountPanelHeader">
        <div><p className="step">KONTO</p><h2 id="account-heading">Zugang verwalten</h2></div>
        <button className="secondary" type="button" onClick={onClose}>Schließen</button>
      </div>
      <div className="accountGrid">
        <form className="accountPassword" onSubmit={changePassword}>
          <h3>Passwort ändern</h3>
          <label>Aktuelles Passwort<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>Neues Passwort<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Neues Passwort wiederholen<input required minLength={12} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>
          <button type="submit">Passwort ändern</button>
        </form>
        {user.is_admin && <section className="accountAdmin" aria-labelledby="users-heading">
          <div className="accountSectionHeader">
            <div><h3 id="users-heading">Tester verwalten</h3><p>Deaktivieren meldet ein Konto sofort ab, erhält aber alle Trainingsdaten.</p></div>
            <button type="button" onClick={onCreateInvitation}>Tester einladen</button>
          </div>
          {loadingUsers
            ? <p className="hint" role="status">Konten werden geladen …</p>
            : <ul className="accountList">{managedUsers.map((managedUser) => <li key={managedUser.id}>
              <div><strong>{managedUser.username}</strong><span>{managedUser.is_admin ? "Administrator" : managedUser.is_active ? "Aktiv" : "Deaktiviert"}</span></div>
              {!managedUser.is_admin && <button
                className={managedUser.is_active ? "danger" : "secondary"}
                type="button"
                disabled={busyUserId === managedUser.id}
                onClick={() => updateUser(managedUser)}
              >{managedUser.is_active ? "Deaktivieren" : "Aktivieren"}</button>}
            </li>)}</ul>}
        </section>}
      </div>
      {message && <p className="message accountMessage" role="status">{message}</p>}
    </section>
  );
}
