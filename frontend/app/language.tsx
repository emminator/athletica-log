"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type Language = "de" | "en";

const storageKey = "athletica-language";
const languageChangeEvent = "athletica-language-change";

function subscribeToLanguage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(languageChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(languageChangeEvent, onStoreChange);
  };
}

function storedLanguage(): Language {
  const language = window.localStorage.getItem(storageKey);
  return language === "en" ? "en" : "de";
}

function serverLanguage(): Language {
  return "de";
}

const translations = {
  de: {
    language: { label: "Sprache", german: "Deutsch", english: "Englisch" },
    common: { close: "Schließen", cancel: "Abbrechen" },
    auth: {
      checking: "Zugriff wird geprüft …",
      unavailable: "Die Anwendung ist momentan nicht erreichbar.",
      invalidLogin: "Benutzername oder Passwort ist nicht korrekt.",
      invalidUsername: "Ungültiger Benutzername. Beginne mit einem Kleinbuchstaben oder einer Zahl und verwende nur Kleinbuchstaben, Zahlen, Punkt, _ oder -.",
      usernameRequirements: "3–32 Zeichen · beginnt mit Kleinbuchstabe oder Zahl · erlaubt: Kleinbuchstaben, Zahlen, Punkt, _ und -",
      passwordsMismatch: "Die Passwörter stimmen nicht überein.",
      usernameTaken: "Dieser Benutzername ist bereits vergeben.",
      invalidInvitation: "Die Einladung ist ungültig oder abgelaufen.",
      samePassword: "Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.",
      invalidReset: "Der Link ist ungültig, abgelaufen oder wurde bereits verwendet.",
      resetSuccess: "Passwort geändert. Du kannst dich jetzt anmelden.",
      copied: (label: string) => `${label} wurde kopiert.`,
      setupAccount: "Konto einrichten",
      resetPassword: "Passwort zurücksetzen",
      signIn: "Anmelden",
      registerIntro: "Wähle deine persönlichen Zugangsdaten. Die Einladung kann nur einmal verwendet werden.",
      resetIntro: "Wähle ein neues Passwort. Der Link kann nur einmal verwendet werden.",
      signInIntro: "Melde dich an, um deine Trainingsdaten zu öffnen.",
      username: "Benutzername",
      password: "Passwort",
      newPassword: "Neues Passwort",
      repeatPassword: "Passwort wiederholen",
      repeatNewPassword: "Neues Passwort wiederholen",
      createAccount: "Konto erstellen",
      savePassword: "Passwort speichern",
      backToSignIn: "Zur Anmeldung",
      account: "Konto",
      signOut: "Abmelden",
      secureLink: "SICHERER LINK",
      copyLink: "Link kopieren",
      hero: "Dein Training.",
      heroAccent: "Messbar besser.",
      heroIntro: "Erfasse deine Übungen und speichere deine vollständigen Trainingseinheiten.",
    },
    account: {
      loadError: "Die Kontoverwaltung konnte nicht geladen werden.",
      newPasswordsMismatch: "Die neuen Passwörter stimmen nicht überein.",
      passwordCheckError: "Prüfe das aktuelle Passwort und verwende ein neues Passwort.",
      passwordChangeError: "Das Passwort konnte nicht geändert werden.",
      passwordChanged: "Passwort geändert. Bitte melde dich erneut an.",
      statusError: "Der Kontostatus konnte nicht geändert werden.",
      activated: (username: string) => `${username} wurde aktiviert.`,
      deactivated: (username: string) => `${username} wurde deaktiviert und abgemeldet.`,
      invitationCreateError: "Einladung konnte nicht erstellt werden.",
      invitationHeading: "Einladung ist 7 Tage gültig",
      invitationLink: "Einladungslink",
      invitationRefreshError: "Die Einladung wurde erstellt, die Liste aber nicht aktualisiert.",
      invitationRevokeError: "Die Einladung konnte nicht widerrufen werden.",
      invitationRevoked: "Die Einladung wurde widerrufen.",
      resetCreateError: "Der Link zum Zurücksetzen konnte nicht erstellt werden.",
      resetHeading: (username: string) => `Passwort-Reset für ${username} · 1 Stunde gültig`,
      resetLink: "Reset-Link",
      eyebrow: "KONTO",
      heading: "Zugang verwalten",
      changePassword: "Passwort ändern",
      currentPassword: "Aktuelles Passwort",
      newPassword: "Neues Passwort",
      repeatNewPassword: "Neues Passwort wiederholen",
      manageTesters: "Tester verwalten",
      testerHint: "Deaktivieren meldet ein Konto sofort ab, erhält aber alle Trainingsdaten.",
      inviteTester: "Tester einladen",
      loading: "Konten werden geladen …",
      administrator: "Administrator",
      active: "Aktiv",
      inactive: "Deaktiviert",
      resetPassword: "Passwort zurücksetzen",
      deactivate: "Deaktivieren",
      activate: "Aktivieren",
      openInvitations: "Offene Einladungen",
      noInvitations: "Keine offenen Einladungen.",
      testerInvitation: "Tester-Einladung",
      validUntil: (date: string) => `Gültig bis ${date}`,
      revoke: "Widerrufen",
    },
    workout: {
      loadError: "Daten konnten nicht geladen werden.",
      oneSet: "Satz",
      manySets: "Sätze",
      totalLoad: "Gesamtlast",
      repetitionsShort: "Wdh.",
      exerciseExists: "Diese Übung existiert bereits.",
      exerciseSaveError: "Übung konnte nicht gespeichert werden.",
      exerciseAdded: (name: string) => `„${name}“ wurde hinzugefügt.`,
      editing: (title: string) => `„${title}“ wird bearbeitet.`,
      duplicated: (title: string) => `„${title}“ wurde als neue Einheit übernommen.`,
      workoutSaveError: "Training konnte nicht gespeichert werden. Bitte prüfe alle Felder.",
      workoutUpdated: "Training erfolgreich aktualisiert.",
      duplicateSaved: "Dupliziertes Training erfolgreich gespeichert.",
      workoutSaved: "Training erfolgreich gespeichert.",
      deleteConfirm: (title: string) => `„${title}“ wirklich löschen?`,
      deleteError: "Training konnte nicht gelöscht werden.",
      deleted: "Training wurde gelöscht.",
      catalogEyebrow: "01 · ÜBUNGSKATALOG",
      addExercise: "Übung hinzufügen",
      name: "Name",
      exercisePlaceholder: "z. B. Kniebeuge",
      muscleGroup: "Muskelgruppe",
      musclePlaceholder: "z. B. Beine",
      saveExercise: "Übung speichern",
      loading: "Daten werden geladen …",
      exercisesAvailable: (count: number) => `${count} Übungen verfügbar`,
      workoutEyebrow: "02 · TRAINING",
      editUnit: "Einheit bearbeiten",
      duplicateUnit: "Einheit duplizieren",
      captureUnit: "Einheit erfassen",
      title: "Titel",
      titlePlaceholder: "z. B. Unterkörper A",
      date: "Datum",
      sets: "Sätze",
      set: (number: number) => `Satz ${number}`,
      exercise: "Übung",
      select: "Auswählen",
      previous: "Zuletzt",
      removeSet: (number: number) => `Satz ${number} entfernen`,
      addSet: "+ Satz",
      saveChanges: "Änderungen speichern",
      saveWorkout: "Training speichern",
      historyEyebrow: "03 · VERLAUF",
      history: "Trainingshistorie",
      noWorkouts: "Noch keine Trainings gespeichert.",
      closeDetails: "Details schließen",
      showDetails: "Details anzeigen",
      duplicate: "Duplizieren",
      edit: "Bearbeiten",
      delete: "Löschen",
    },
  },
  en: {
    language: { label: "Language", german: "German", english: "English" },
    common: { close: "Close", cancel: "Cancel" },
    auth: {
      checking: "Checking access …",
      unavailable: "The application is currently unavailable.",
      invalidLogin: "The username or password is incorrect.",
      invalidUsername: "Invalid username. Start with a lowercase letter or number and use only lowercase letters, numbers, periods, underscores, or hyphens.",
      usernameRequirements: "3–32 characters · starts with a lowercase letter or number · allowed: lowercase letters, numbers, period, _ and -",
      passwordsMismatch: "The passwords do not match.",
      usernameTaken: "This username is already taken.",
      invalidInvitation: "The invitation is invalid or has expired.",
      samePassword: "The new password must be different from the current password.",
      invalidReset: "The link is invalid, expired, or has already been used.",
      resetSuccess: "Password changed. You can now sign in.",
      copied: (label: string) => `${label} copied.`,
      setupAccount: "Set up account",
      resetPassword: "Reset password",
      signIn: "Sign in",
      registerIntro: "Choose your personal credentials. This invitation can only be used once.",
      resetIntro: "Choose a new password. This link can only be used once.",
      signInIntro: "Sign in to access your training data.",
      username: "Username",
      password: "Password",
      newPassword: "New password",
      repeatPassword: "Repeat password",
      repeatNewPassword: "Repeat new password",
      createAccount: "Create account",
      savePassword: "Save password",
      backToSignIn: "Back to sign in",
      account: "Account",
      signOut: "Sign out",
      secureLink: "SECURE LINK",
      copyLink: "Copy link",
      hero: "Your training.",
      heroAccent: "Measurably better.",
      heroIntro: "Add exercises and save complete training sessions.",
    },
    account: {
      loadError: "Account management could not be loaded.",
      newPasswordsMismatch: "The new passwords do not match.",
      passwordCheckError: "Check your current password and choose a different new password.",
      passwordChangeError: "The password could not be changed.",
      passwordChanged: "Password changed. Please sign in again.",
      statusError: "The account status could not be changed.",
      activated: (username: string) => `${username} was activated.`,
      deactivated: (username: string) => `${username} was deactivated and signed out.`,
      invitationCreateError: "The invitation could not be created.",
      invitationHeading: "Invitation valid for 7 days",
      invitationLink: "Invitation link",
      invitationRefreshError: "The invitation was created, but the list could not be refreshed.",
      invitationRevokeError: "The invitation could not be revoked.",
      invitationRevoked: "The invitation was revoked.",
      resetCreateError: "The password reset link could not be created.",
      resetHeading: (username: string) => `Password reset for ${username} · valid for 1 hour`,
      resetLink: "Reset link",
      eyebrow: "ACCOUNT",
      heading: "Manage access",
      changePassword: "Change password",
      currentPassword: "Current password",
      newPassword: "New password",
      repeatNewPassword: "Repeat new password",
      manageTesters: "Manage testers",
      testerHint: "Deactivating an account signs it out immediately while preserving all training data.",
      inviteTester: "Invite tester",
      loading: "Loading accounts …",
      administrator: "Administrator",
      active: "Active",
      inactive: "Inactive",
      resetPassword: "Reset password",
      deactivate: "Deactivate",
      activate: "Activate",
      openInvitations: "Open invitations",
      noInvitations: "No open invitations.",
      testerInvitation: "Tester invitation",
      validUntil: (date: string) => `Valid until ${date}`,
      revoke: "Revoke",
    },
    workout: {
      loadError: "The data could not be loaded.",
      oneSet: "set",
      manySets: "sets",
      totalLoad: "Total load",
      repetitionsShort: "Reps",
      exerciseExists: "This exercise already exists.",
      exerciseSaveError: "The exercise could not be saved.",
      exerciseAdded: (name: string) => `“${name}” was added.`,
      editing: (title: string) => `Editing “${title}”.`,
      duplicated: (title: string) => `“${title}” was copied into a new session.`,
      workoutSaveError: "The workout could not be saved. Please check all fields.",
      workoutUpdated: "Workout updated successfully.",
      duplicateSaved: "Duplicated workout saved successfully.",
      workoutSaved: "Workout saved successfully.",
      deleteConfirm: (title: string) => `Delete “${title}”?`,
      deleteError: "The workout could not be deleted.",
      deleted: "Workout deleted.",
      catalogEyebrow: "01 · EXERCISE CATALOG",
      addExercise: "Add exercise",
      name: "Name",
      exercisePlaceholder: "e.g. Squat",
      muscleGroup: "Muscle group",
      musclePlaceholder: "e.g. Legs",
      saveExercise: "Save exercise",
      loading: "Loading data …",
      exercisesAvailable: (count: number) => `${count} exercises available`,
      workoutEyebrow: "02 · WORKOUT",
      editUnit: "Edit session",
      duplicateUnit: "Duplicate session",
      captureUnit: "Log session",
      title: "Title",
      titlePlaceholder: "e.g. Lower Body A",
      date: "Date",
      sets: "Sets",
      set: (number: number) => `Set ${number}`,
      exercise: "Exercise",
      select: "Select",
      previous: "Last",
      removeSet: (number: number) => `Remove set ${number}`,
      addSet: "+ Set",
      saveChanges: "Save changes",
      saveWorkout: "Save workout",
      historyEyebrow: "03 · HISTORY",
      history: "Training history",
      noWorkouts: "No workouts saved yet.",
      closeDetails: "Hide details",
      showDetails: "Show details",
      duplicate: "Duplicate",
      edit: "Edit",
      delete: "Delete",
    },
  },
} as const;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  locale: "de-DE" | "en-US";
  t: (typeof translations)[Language];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribeToLanguage, storedLanguage, serverLanguage);
  const setLanguage = useCallback((newLanguage: Language) => {
    window.localStorage.setItem(storageKey, newLanguage);
    window.dispatchEvent(new Event(languageChangeEvent));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    locale: language === "de" ? "de-DE" : "en-US",
    t: translations[language],
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="languageSwitcher" role="group" aria-label={t.language.label}>
      <button type="button" aria-label={t.language.german} aria-pressed={language === "de"} onClick={() => setLanguage("de")}>DE</button>
      <button type="button" aria-label={t.language.english} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
    </div>
  );
}
