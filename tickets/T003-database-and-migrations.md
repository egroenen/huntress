# T003: Database and Migrations

Status: Done

## Goal

Set up SQLite persistence and a migration system so runtime state can be stored safely across restarts.

## Scope

- Introduce SQLite connection management.
- Add schema migration support.
- Create the MVP tables:
  - `schema_migrations`
  - `service_state`
  - `app_user`
  - `app_session`
  - `media_item_state`
  - `run_history`
  - `search_attempt`
  - `release_suppression`
  - `transmission_torrent_state`
  - `login_attempt`
- Add repository helpers or query modules for these tables.
- Ensure DB startup behavior is deterministic.

## Out of Scope

- Real auth flow
- Search logic
- External API sync

## Dependencies

- `T001-project-scaffold.md`
- `T002-config-and-startup-validation.md`

## Implementation Notes

- Keep migrations explicit and forward-only.
- The DB path should live under `/data` in container usage.
- The service should create the DB if it does not already exist.
- Repository code should stay thin and not mix in domain logic.

## Acceptance Criteria

- Service starts against an empty SQLite database and applies migrations successfully.
- Re-running startup does not reapply already applied migrations.
- Tables and indexes match the agreed schema.
- Repository helpers are available for later tickets.

## Test Notes

- Migration tests on empty and already-initialized databases.
- Sanity checks for expected tables and indexes.
