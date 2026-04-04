# T004: Auth Bootstrap and Sessions

Status: Done

## Goal

Implement built-in authentication for the UI and operator API, including first-run bootstrap and SQLite-backed sessions.

## Scope

- Detect first startup with no users.
- Serve a bootstrap setup flow that creates the first admin user.
- Implement login and logout.
- Hash passwords with Argon2id.
- Persist sessions in SQLite.
- Enforce:
  - 7 day absolute session lifetime
  - 24 hour idle timeout
- Record login attempts.
- Implement `RESET_AUTH=true` handling at startup to clear users and sessions only.

## Out of Scope

- Password reset UI
- Multi-user roles
- External auth providers

## Dependencies

- `T002-config-and-startup-validation.md`
- `T003-database-and-migrations.md`

## Implementation Notes

- The reset path should be explicit and noisy in logs.
- CSRF protection is required for state-changing authenticated UI actions.
- Session cookies should be HTTP-only and secure when served behind TLS-aware infrastructure.
- Lost-password recovery is config/startup-flag based only.

## Acceptance Criteria

- First launch with no user redirects to setup.
- Setup creates one admin user successfully.
- Login succeeds with correct credentials and fails with incorrect credentials.
- Sessions persist across service restarts.
- Idle and absolute session expiration are enforced.
- `RESET_AUTH=true` clears only auth-related data and returns the app to bootstrap mode.

## Test Notes

- Integration tests for bootstrap, login, logout, and expiry behavior.
- Verification that non-auth tables survive auth reset.
