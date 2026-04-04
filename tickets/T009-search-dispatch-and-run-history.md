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
  - rolling cooldown windows for recent search volume
  - optional hard stop when a configured search budget is exceeded over a time window
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
- Release-level selection is explicitly deferred. `T009` triggers Arr searches only; choosing a specific fallback release or forcing a fast-follow upgrade policy belongs in a later acquisition-policy layer.
- Rate limiting needs to protect against tracker blacklisting, not just internal queue bursts.
- Implement both:
  - per-cycle controls
  - rolling-window controls such as searches per 15m, 1h, and 24h
- When a rolling-window threshold is exceeded, the dispatcher should stop sending searches and record an explicit throttle reason instead of silently dropping items.
- Dispatch pacing and throttle decisions must be visible to later UI/metrics work.

## Acceptance Criteria

- Manual dry-run persists decisions without sending search commands.
- Live runs send only budget-allowed commands.
- Live runs stop dispatching cleanly when rolling-window search budgets are exceeded.
- Post-dispatch state updates are written correctly.
- Run history reflects dispatch, skip, and error counts accurately.

## Test Notes

- Integration tests with mocked Sonarr/Radarr command endpoints.
- Verification that dry-run performs no dispatches.
- Tests for rolling-window throttling and explicit throttle stop behavior.
