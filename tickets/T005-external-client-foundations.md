# T005: External Client Foundations

Status: Backlog

## Goal

Build the foundational API clients for Sonarr, Radarr, Prowlarr, and Transmission with defensive request handling and typed normalized responses.

## Scope

- Add HTTP client wrappers for:
  - Sonarr
  - Radarr
  - Prowlarr
  - Transmission RPC
- Implement dependency probes:
  - Sonarr `/system/status`
  - Radarr `/system/status`
  - Prowlarr health/indexer status
  - Transmission connectivity
- Add defensive timeout and retry handling where appropriate.
- Implement Transmission session-id refresh behavior for HTTP 409 responses.
- Define normalized response models used by later sync logic.

## Out of Scope

- Persisting synced data
- Search dispatch decisions
- Scheduler integration

## Dependencies

- `T002-config-and-startup-validation.md`
- `T003-database-and-migrations.md`

## Implementation Notes

- Integration modules should not make business decisions.
- Normalize only the fields needed by the MVP.
- Make API errors explicit and typed so later tickets can distinguish degraded vs unavailable dependencies.

## Acceptance Criteria

- Each external dependency can be probed independently.
- Transmission client handles session-id negotiation correctly.
- Normalized models exist for wanted state, queue state, health state, and torrent state.
- Errors are surfaced in a way the scheduler can use later.

## Test Notes

- Mocked integration tests for success, timeout, invalid payload, and partial failure scenarios.
