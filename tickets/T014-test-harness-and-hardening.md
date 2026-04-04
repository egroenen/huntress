# T014: Test Harness and Hardening

Status: Backlog

## Goal

Create the test harness and final hardening pass needed to trust the MVP before live usage.

## Scope

- Add unit test coverage for:
  - config validation
  - auth/session logic
  - retry/backoff logic
  - decision engine
  - Transmission guard decisions
- Add integration-style tests for mocked external services.
- Add restart and persistence tests.
- Add dry-run verification tests.
- Add run-lock and stale-lock recovery tests.
- Add a final hardening checklist for live enablement.

## Out of Scope

- Performance testing at large scale beyond what is useful for a home-lab deployment
- Full browser automation unless needed

## Dependencies

- `T004-auth-bootstrap-and-sessions.md`
- `T009-search-dispatch-and-run-history.md`
- `T010-transmission-guard-and-suppressions.md`
- `T012-observability-and-health.md`

## Implementation Notes

- Keep test fixtures readable and close to real-world API payload shapes.
- Dry-run and live-run behavior must be explicitly separated in tests.
- Include a final checklist for moving from dry-run to live operation.

## Acceptance Criteria

- Critical orchestration logic is covered by automated tests.
- Mocked end-to-end runs exercise sync, decision, and dispatch flow.
- Restart behavior is safe and does not cause duplicate search bursts.
- A documented pre-live checklist exists.

## Test Notes

- This ticket is itself test-focused and should leave the repo with a reliable automated baseline.
