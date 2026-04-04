# T009: Search Dispatch and Run History

Status: Backlog

## Goal

Turn eligible candidates into actual Sonarr and Radarr search commands while updating orchestration history safely.

## Scope

- Dispatch Sonarr searches for eligible episode candidates.
- Dispatch Radarr searches for eligible movie candidates.
- Apply:
  - global dispatch spacing
  - global cycle caps
  - per-app cycle caps
- Persist `search_attempt` records for both dispatch and skip decisions.
- Update `media_item_state` fields after dispatch:
  - `retry_count`
  - `last_search_at`
  - `next_eligible_at`
- Track accepted command IDs when available.
- Record run summary counts.

## Out of Scope

- Transmission suppression
- UI pages beyond what is needed for manual API triggers

## Dependencies

- `T007-decision-engine-and-reason-codes.md`
- `T008-scheduler-and-run-coordination.md`

## Implementation Notes

- Only scoped searches are allowed.
- No bulk whole-library commands.
- Dry-run mode must exercise the same decision path without sending commands.
- A failed dispatch should not silently look like a skip.

## Acceptance Criteria

- Manual dry-run persists decisions without sending search commands.
- Live runs send only budget-allowed commands.
- Post-dispatch state updates are written correctly.
- Run history reflects dispatch, skip, and error counts accurately.

## Test Notes

- Integration tests with mocked Sonarr/Radarr command endpoints.
- Verification that dry-run performs no dispatches.
