# T018: Incremental Arr Page Coverage

Status: Done

## Goal

Replace full wanted-list pagination walks with a gentler incremental coverage strategy that samples a small number of wanted pages per cycle, persists page history, and gradually refreshes the whole Sonarr/Radarr wanted space over time.

## Scope

- Add a configurable sync strategy for large wanted collections.
- Persist coverage history for wanted page fetches.
- Choose one or more pages per cycle using a deterministic-but-spread-out strategy.
- Prefer pages that have not been fetched recently.
- Support separate coverage for:
  - Sonarr missing
  - Sonarr cutoff
  - Radarr missing
  - Radarr cutoff
- Show current page coverage status in logs and the Status page.
- Fall back to full scans when total page count is small.

## Out of Scope

- Changing Arr queue sync behavior
- Changing search decision logic
- Release selection or quality fallback policy

## Dependencies

- `T006-arr-state-sync.md`
- `T012-observability-and-health.md`

## Implementation Notes

- The current full-scan approach is correct but too expensive once wanted endpoints stretch into hundreds or thousands of pages.
- Model this as **incremental coverage**, not opaque randomness:
  - discover page count from the first page
  - choose the next page from the least-recently-fetched pages
  - allow a small amount of randomness only as a tiebreaker
- Persist coverage in SQLite using a new state table keyed by:
  - app
  - wanted collection (`missing` or `cutoff`)
  - page number
- Record:
  - last fetched at
  - last fetch status
  - last observed total pages
  - last observed total records
- Add safety controls:
  - max wanted pages per cycle
  - full scan threshold
  - reset/reseed coverage history if page counts shrink sharply
- Expose the current strategy and recent page fetches in the operator UI so the behavior stays explainable.

## Acceptance Criteria

- Large wanted collections no longer fetch every page on every cycle.
- The orchestrator persists which wanted pages were fetched and when.
- Over repeated cycles, all pages become eligible for refresh instead of the same pages being hit repeatedly.
- Sync logs and status output clearly show which page was selected and why.
- Small wanted collections still use full scans automatically.

## Test Notes

- Coverage selection tests for:
  - unseen pages preferred first
  - least-recently-fetched pages preferred next
  - total-page shrink/growth handling
- Integration tests verifying only the configured number of pages are fetched per cycle.
- UI/logging coverage so operators can tell the difference between full scans and incremental scans.
