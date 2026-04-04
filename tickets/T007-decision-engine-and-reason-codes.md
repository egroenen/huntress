# T007: Decision Engine and Reason Codes

Status: Backlog

## Goal

Implement the deterministic search eligibility engine that decides what would be searched, what gets skipped, and why.

## Scope

- Add the agreed reason code catalog.
- Implement skip rules for:
  - unmonitored items
  - unreleased items
  - ignored state
  - in-queue items
  - suppressed items
  - cooldown-active items
  - dependency blocks
  - budget exhaustion
- Implement priority bucket assignment.
- Implement deterministic sort ordering.
- Implement separate Sonarr and Radarr retry ladders.
- Produce candidate previews without dispatching anything.

## Out of Scope

- Actual search dispatch
- Scheduler lock handling
- UI rendering

## Dependencies

- `T006-arr-state-sync.md`

## Implementation Notes

- This module must be pure and easy to test.
- No database writes or external HTTP calls inside the decision engine.
- The output should be directly reusable for dry-run API/UI views.

## Acceptance Criteria

- Candidate evaluation returns deterministic decisions and reason codes.
- The same input state yields the same sorted output every time.
- Sonarr and Radarr use separate policies while sharing the same scheduler cadence.
- Retry interval behavior matches the agreed backoff ladders.

## Test Notes

- Table-driven unit tests for all reason codes and priority buckets.
- Deterministic ordering tests with fixed timestamps.
