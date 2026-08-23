# Portfolio demo readiness

This document separates the readiness of the existing production MVP from future
product scope. It is intentionally short and prioritizes a safe, credible review
experience for recruiters or external testers.

## Ready now

- Production deployment with a custom domain and managed TLS.
- Responsive German and English interfaces.
- Invite-only multi-user accounts with server-side data isolation.
- Dedicated non-admin `reviewer` account with synthetic exercises and workouts;
  credentials remain outside the repository.
- Sanitized desktop and responsive mobile screenshots in the README.
- Docker-based local development and repeatable frontend installs through the
  committed pnpm lockfile.
- Automated linting, type checking, backend and frontend tests, production-image
  build, health checks, and deployment smoke tests.
- Release, deployment, recovery, and operations documentation.
- A targeted repository scan detected no tracked secrets, private keys, password
  hashes, or database exports in the current files or inspected Git history.
- Commit authors use a GitHub noreply address.

## Before sharing broadly

### Required for a recruiter demo

1. Review every English screen once end to end, including invitation, login,
   password reset, empty states, validation, and error messages.
2. Capture an optional final screenshot on a real iPhone from the sanitized
   account; the repository currently contains a responsive browser capture.
3. Deliver the live URL and reviewer credentials through a private channel.
   Credentials must stay outside Git and the application materials.

### Required before making the repository public

1. Choose and add a license. The repository currently has none.
2. Repeat the secret and Git-history scan immediately before changing visibility.
3. Confirm that all documentation, issue history, branch names, and commit
   metadata are suitable for public viewing.
4. Decide whether the production hostname and provider-specific operations
   details should remain in the public repository.

### Valuable hardening, not a demo blocker

1. Adopt a locked Python dependency workflow so backend builds resolve identical
   transitive versions over time.
2. Add automated dependency update and vulnerability scanning to GitHub.
3. Record a successful backup-restore drill and verify alert delivery from the
   external uptime monitor.
4. Add a browser-level end-to-end smoke test for login, workout creation, and
   user-data isolation.

## Product roadmap, not portfolio polish

- Import historical training notes.
- Add workout templates, planning, and progression rules.
- Add deeper analytics such as estimated one-repetition maximum and trends.
- Consider offline-first workout entry only after the core workflows are stable.

These features may strengthen the product later, but they are not prerequisites
for demonstrating the current engineering work.
