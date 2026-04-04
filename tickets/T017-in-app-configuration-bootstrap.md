# T017: In-App Configuration Bootstrap

Status: Done

## Goal

Make the app usable before Sonarr, Radarr, Prowlarr, and Transmission are fully configured by persisting connection settings inside the app and replacing hard startup failures with a guided “not configured yet” state.

## Scope

- Auto-generate and persist the session secret when no env override is present.
- Persist connection settings for:
  - Sonarr
  - Radarr
  - Prowlarr
  - Transmission
- Allow startup when API keys or Transmission credentials are missing.
- Add configuration status visibility to the settings page.
- Add “test connection” actions in the UI for each service.
- Save updated settings from the UI into persisted state.
- Keep env vars as optional overrides for advanced/container use.

## Out of Scope

- Multi-instance configuration
- Encrypted-at-rest secrets
- Full onboarding wizard beyond the existing auth bootstrap
- Per-service advanced tuning inside the UI

## Dependencies

- `T003-database-and-migrations.md`
- `T004-auth-bootstrap-and-sessions.md`
- `T011-operator-ui.md`
- `T012-observability-and-health.md`

## Implementation Notes

- Keep YAML as the source for static defaults like schedules, limits, and fallback URLs.
- Use persisted app state for operator-managed connection details.
- Prefer deterministic precedence:
  - env override
  - persisted app setting
  - YAML default
- If a required service is not configured:
  - app startup must still succeed
  - readiness should stay false
  - UI should explain what is missing
- Local development should tolerate the container-oriented `/data` path by falling back safely when it is not writable.

## Acceptance Criteria

- The app boots without Arr/Transmission env secrets set.
- The session secret is created automatically and remains stable across restarts.
- Settings can be saved from the UI.
- Connection tests can be triggered from the UI.
- The overview and readiness flow reflect a “not configured yet” state instead of crashing.

## Test Notes

- Verify the generated session secret persists across multiple runtime resolutions.
- Verify persisted settings override missing env secrets.
- Verify local dev startup works with the sample config even when `/data` is not writable.
