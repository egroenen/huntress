# T016: Search Rate Controls and Budget Visibility

Status: Done

## Goal

Make search-rate protection a first-class control plane so the orchestrator can avoid tracker or indexer blacklisting while making its current search budget easy to understand.

## Scope

- Define configurable rolling search windows, for example:
  - searches per 15 minutes
  - searches per hour
  - searches per 24 hours
- Persist enough history to calculate current rolling search usage accurately.
- Add throttle decisions and reason codes such as:
  - `THROTTLE_GLOBAL_15M_BUDGET`
  - `THROTTLE_GLOBAL_1H_BUDGET`
  - `THROTTLE_GLOBAL_24H_BUDGET`
- Expose remaining budget and next eligible dispatch time.
- Add UI status indicators for:
  - current search rate
  - active throttle state
  - time until dispatch resumes
- Add a hard emergency stop mode for search dispatch without disabling the whole service.

## Out of Scope

- External quota synchronization with trackers
- Automatic per-indexer learning unless it is added later

## Dependencies

- `T009-search-dispatch-and-run-history.md`
- `T011-operator-ui.md`
- `T012-observability-and-health.md`

## Implementation Notes

- This should sit above simple per-cycle caps. Both protections are needed.
- Rolling-window controls should use persisted timestamps rather than in-memory counters so restart behavior stays safe.
- Throttle events should be explicit and operator-visible:
  - why throttling began
  - which budget was exceeded
  - when searches can resume
- Default settings should be conservative for private tracker friendliness.

## Acceptance Criteria

- The orchestrator stops dispatching when rolling-window budgets are exhausted.
- The current remaining search budget is visible in both metrics/logs and the UI.
- Restarting the service does not reset the effective rolling-window counters incorrectly.
- Operators can see exactly why searching is paused and when it will resume.

## Test Notes

- Tests for rolling-window accounting across restarts.
- Tests for throttle reason selection when multiple windows are exceeded.
- UI/status tests verifying the display of remaining budget and next eligible dispatch time.
