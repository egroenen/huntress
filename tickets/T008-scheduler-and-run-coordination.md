# T008: Scheduler and Run Coordination

Status: Done

## Goal

Implement the long-running scheduler, startup grace behavior, and safe run coordination so cycles execute predictably and never overlap.

## Scope

- Add the shared scheduler cadence.
- Implement startup grace period.
- Implement a persisted scheduler lock using `service_state`.
- Add run creation and lifecycle tracking in `run_history`.
- Support manual run types:
  - sync only
  - manual dry-run
  - manual live run
- Prevent overlapping runs.
- Reclaim stale locks safely after timeout.

## Out of Scope

- Search dispatch details
- Full UI pages

## Dependencies

- `T003-database-and-migrations.md`
- `T006-arr-state-sync.md`
- `T007-decision-engine-and-reason-codes.md`

## Implementation Notes

- Sync-only runs should be allowed even during startup grace.
- Live dispatch should not happen during startup grace.
- Run summaries should be written even for partial or failed runs.

## Acceptance Criteria

- The scheduler runs on the configured cadence.
- Only one active run is allowed at a time.
- Manual run requests are rejected cleanly when another run is active.
- Stale lock recovery works after simulated interruption.

## Test Notes

- Concurrency tests for run locking.
- Crash/restart simulation for stale lock reclaim.
