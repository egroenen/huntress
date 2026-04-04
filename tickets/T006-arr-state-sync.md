# T006: Arr State Sync

Status: Backlog

## Goal

Fetch wanted state from Sonarr and Radarr, normalize it, and persist the current orchestrator view into SQLite.

## Scope

- Sync Sonarr:
  - wanted missing
  - wanted cutoff
  - queue details
- Sync Radarr:
  - wanted missing
  - wanted cutoff
  - queue details
- Normalize items into canonical `media_item_state` rows.
- Track `last_seen_at` and update existing rows deterministically.
- Mark queue state for items currently in Arr queue.
- Handle items disappearing from current snapshots safely.

## Out of Scope

- Search dispatch
- Retry and prioritization logic
- Transmission loop detection

## Dependencies

- `T003-database-and-migrations.md`
- `T005-external-client-foundations.md`

## Implementation Notes

- Sonarr should be tracked at episode level for MVP.
- Radarr should be tracked at movie level.
- Do not discard historical retry fields when refreshing current item state.
- Treat Arr as the source of truth for library state, and the local DB as the source of orchestration history.

## Acceptance Criteria

- A sync pass writes current Sonarr and Radarr wanted state into SQLite.
- Existing records are updated rather than duplicated.
- Queue state is reflected in `media_item_state`.
- Missing and cutoff-unmet items can be distinguished in persisted state.

## Test Notes

- Integration-style tests using mocked Sonarr/Radarr payloads.
- Coverage for changed titles, queue transitions, and items that disappear from current wanted responses.
