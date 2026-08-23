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

type OpenInvitation = {
  id: string;
  created_at: string;
  expires_at: string;
};

type AccessLink = {
  heading: string;
  label: string;
  url: string;
};

async function fetchAdminData(): Promise<[ManagedUser[], OpenInvitation[]]> {
  const [usersResponse, invitationsResponse] = await Promise.all([
    apiFetch("/api/v1/auth/users"),
    apiFetch("/api/v1/auth/invitations"),
  ]);
  if (!usersResponse.ok || !invitationsResponse.ok) throw new Error("admin data unavailable");
  return [
    (await usersResponse.json()) as ManagedUser[],
    (await invitationsResponse.json()) as OpenInvitation[],
  ];
}

type AccountPanelProps = {
  user: SessionUser;
  onClose: () => void;
  onAccessLink: (link: AccessLink) => void;
  onPasswordChanged: (message: string) => void;
};

export default function AccountPanel({
  user,
  onClose,
  onAccessLink,
  onPasswordChanged,
}: AccountPanelProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [openInvitations, setOpenInvitations] = useState<OpenInvitation[]>([]);
  const [message, setMessage] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(user.is_admin);
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    if (!user.is_admin) return;
    let active = true;
    fetchAdminData()
      .then(([users, invitations]) => {
        if (!active) return;
        setManagedUsers(users);
        setOpenInvitations(invitations);
      })
      .catch(() => {
        if (active) setMessage("Die Kontoverwaltung konnte nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => { active = false; };
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
    setBusyAction(`status-${managedUser.id}`);
    const response = await apiFetch(`/api/v1/auth/users/${managedUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !managedUser.is_active }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Der Kontostatus konnte nicht geändert werden.");
      setBusyAction("");
      return;
    }
    const updated = (await response.json()) as ManagedUser;
    setManagedUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setMessage(updated.is_active
      ? `${updated.username} wurde aktiviert.`
      : `${updated.username} wurde deaktiviert und abgemeldet.`);
    setBusyAction("");
  }

  async function createInvitation() {
    setMessage("");
    setBusyAction("create-invitation");
    const response = await apiFetch("/api/v1/auth/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_days: 7 }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Einladung konnte nicht erstellt werden.");
      setBusyAction("");
      return;
    }
    const invitation = (await response.json()) as { token: string; expires_at: string };
    onAccessLink({
      heading: "Einladung ist 7 Tage gültig",
      label: "Einladungslink",
      url: `${window.location.origin}/#invite=${encodeURIComponent(invitation.token)}`,
    });
    await fetchAdminData()
      .then(([users, invitations]) => {
        setManagedUsers(users);
        setOpenInvitations(invitations);
      })
      .catch(() => setMessage("Die Einladung wurde erstellt, die Liste aber nicht aktualisiert."));
    setBusyAction("");
  }

  async function revokeInvitation(invitation: OpenInvitation) {
    setMessage("");
    setBusyAction(`invitation-${invitation.id}`);
    const response = await apiFetch(`/api/v1/auth/invitations/${invitation.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Die Einladung konnte nicht widerrufen werden.");
    } else {
      setOpenInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setMessage("Die Einladung wurde widerrufen.");
    }
    setBusyAction("");
  }

  async function createPasswordReset(managedUser: ManagedUser) {
    setMessage("");
    setBusyAction(`reset-${managedUser.id}`);
    const response = await apiFetch(`/api/v1/auth/users/${managedUser.id}/password-resets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_in_hours: 1 }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage("Der Link zum Zurücksetzen konnte nicht erstellt werden.");
      setBusyAction("");
      return;
    }
    const reset = (await response.json()) as { token: string; expires_at: string };
    onAccessLink({
      heading: `Passwort-Reset für ${managedUser.username} · 1 Stunde gültig`,
      label: "Reset-Link",
      url: `${window.location.origin}/#reset=${encodeURIComponent(reset.token)}`,
    });
    setBusyAction("");
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
            <button type="button" disabled={busyAction === "create-invitation"} onClick={createInvitation}>Tester einladen</button>
          </div>
          {loadingUsers
            ? <p className="hint" role="status">Konten werden geladen …</p>
            : <ul className="accountList">{managedUsers.map((managedUser) => <li key={managedUser.id}>
              <div className="accountIdentity"><strong>{managedUser.username}</strong><span>{managedUser.is_admin ? "Administrator" : managedUser.is_active ? "Aktiv" : "Deaktiviert"}</span></div>
              {!managedUser.is_admin && <div className="accountListActions">
                {managedUser.is_active && <button
                  className="secondary"
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => createPasswordReset(managedUser)}
                >Passwort zurücksetzen</button>}
                <button
                  className={managedUser.is_active ? "danger" : "secondary"}
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => updateUser(managedUser)}
                >{managedUser.is_active ? "Deaktivieren" : "Aktivieren"}</button>
              </div>}
            </li>)}</ul>}
          <div className="accountSubsection">
            <h3>Offene Einladungen</h3>
            {openInvitations.length === 0
              ? <p className="hint">Keine offenen Einladungen.</p>
              : <ul className="accountList">{openInvitations.map((invitation) => <li key={invitation.id}>
                <div className="accountIdentity"><strong>Tester-Einladung</strong><span>Gültig bis {new Date(invitation.expires_at).toLocaleString("de-DE")}</span></div>
                <button
                  className="danger"
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => revokeInvitation(invitation)}
                >Widerrufen</button>
              </li>)}</ul>}
          </div>
        </section>}
      </div>
      {message && <p className="message accountMessage" role="status">{message}</p>}
    </section>
  );
}
