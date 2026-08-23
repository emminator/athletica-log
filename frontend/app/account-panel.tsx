"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { useLanguage } from "./language";

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
  const { locale, t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [openInvitations, setOpenInvitations] = useState<OpenInvitation[]>([]);
  const [message, setMessage] = useState("");
  const [adminLoadFailed, setAdminLoadFailed] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(user.is_admin);
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    if (!user.is_admin) return;
    let active = true;
    fetchAdminData()
      .then(([users, invitations]) => {
        if (!active) return;
        setAdminLoadFailed(false);
        setManagedUsers(users);
        setOpenInvitations(invitations);
      })
      .catch(() => {
        if (active) setAdminLoadFailed(true);
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
      setMessage(t.account.newPasswordsMismatch);
      return;
    }
    const response = await apiFetch("/api/v1/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(response?.status === 400
        ? t.account.passwordCheckError
        : t.account.passwordChangeError);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    onPasswordChanged(t.account.passwordChanged);
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
      setMessage(t.account.statusError);
      setBusyAction("");
      return;
    }
    const updated = (await response.json()) as ManagedUser;
    setManagedUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    setMessage(updated.is_active
      ? t.account.activated(updated.username)
      : t.account.deactivated(updated.username));
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
      setMessage(t.account.invitationCreateError);
      setBusyAction("");
      return;
    }
    const invitation = (await response.json()) as { token: string; expires_at: string };
    onAccessLink({
      heading: t.account.invitationHeading,
      label: t.account.invitationLink,
      url: `${window.location.origin}/#invite=${encodeURIComponent(invitation.token)}`,
    });
    await fetchAdminData()
      .then(([users, invitations]) => {
        setManagedUsers(users);
        setOpenInvitations(invitations);
      })
      .catch(() => setMessage(t.account.invitationRefreshError));
    setBusyAction("");
  }

  async function revokeInvitation(invitation: OpenInvitation) {
    setMessage("");
    setBusyAction(`invitation-${invitation.id}`);
    const response = await apiFetch(`/api/v1/auth/invitations/${invitation.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(t.account.invitationRevokeError);
    } else {
      setOpenInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setMessage(t.account.invitationRevoked);
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
      setMessage(t.account.resetCreateError);
      setBusyAction("");
      return;
    }
    const reset = (await response.json()) as { token: string; expires_at: string };
    onAccessLink({
      heading: t.account.resetHeading(managedUser.username),
      label: t.account.resetLink,
      url: `${window.location.origin}/#reset=${encodeURIComponent(reset.token)}`,
    });
    setBusyAction("");
  }

  return (
    <section className="accountPanel" aria-labelledby="account-heading">
      <div className="accountPanelHeader">
        <div><p className="step">{t.account.eyebrow}</p><h2 id="account-heading">{t.account.heading}</h2></div>
        <button className="secondary" type="button" onClick={onClose}>{t.common.close}</button>
      </div>
      <div className="accountGrid">
        <form className="accountPassword" onSubmit={changePassword}>
          <h3>{t.account.changePassword}</h3>
          <label>{t.account.currentPassword}<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>{t.account.newPassword}<input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>{t.account.repeatNewPassword}<input required minLength={12} type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>
          <button type="submit">{t.account.changePassword}</button>
        </form>
        {user.is_admin && <section className="accountAdmin" aria-labelledby="users-heading">
          <div className="accountSectionHeader">
            <div><h3 id="users-heading">{t.account.manageTesters}</h3><p>{t.account.testerHint}</p></div>
            <button type="button" disabled={busyAction === "create-invitation"} onClick={createInvitation}>{t.account.inviteTester}</button>
          </div>
          {loadingUsers
            ? <p className="hint" role="status">{t.account.loading}</p>
            : <ul className="accountList">{managedUsers.map((managedUser) => <li key={managedUser.id}>
              <div className="accountIdentity"><strong>{managedUser.username}</strong><span>{managedUser.is_admin ? t.account.administrator : managedUser.is_active ? t.account.active : t.account.inactive}</span></div>
              {!managedUser.is_admin && <div className="accountListActions">
                {managedUser.is_active && <button
                  className="secondary"
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => createPasswordReset(managedUser)}
                >{t.account.resetPassword}</button>}
                <button
                  className={managedUser.is_active ? "danger" : "secondary"}
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => updateUser(managedUser)}
                >{managedUser.is_active ? t.account.deactivate : t.account.activate}</button>
              </div>}
            </li>)}</ul>}
          <div className="accountSubsection">
            <h3>{t.account.openInvitations}</h3>
            {openInvitations.length === 0
              ? <p className="hint">{t.account.noInvitations}</p>
              : <ul className="accountList">{openInvitations.map((invitation) => <li key={invitation.id}>
                <div className="accountIdentity"><strong>{t.account.testerInvitation}</strong><span>{t.account.validUntil(new Date(invitation.expires_at).toLocaleString(locale))}</span></div>
                <button
                  className="danger"
                  type="button"
                  disabled={busyAction !== ""}
                  onClick={() => revokeInvitation(invitation)}
                >{t.account.revoke}</button>
              </li>)}</ul>}
          </div>
        </section>}
      </div>
      {(message || adminLoadFailed) && <p className="message accountMessage" role="status">{message || t.account.loadError}</p>}
    </section>
  );
}
