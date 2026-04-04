# T011: Operator UI

Status: Backlog

## Goal

Provide a lightweight, authenticated web UI that makes the service behavior visible and trustworthy.

## Scope

- Build server-rendered UI pages for:
  - bootstrap setup
  - login
  - dashboard
  - run history
  - run detail
  - candidate preview
  - suppressions
  - Transmission view
  - settings summary
- Add whole-cycle operator actions:
  - run sync now
  - run dry-run cycle now
  - run live cycle now
- Show current mode, next run, health state, and last run status.
- Show reason codes and candidate outcomes clearly.
- Use a Sonarr/Radarr-inspired operator-console layout and visual style:
  - persistent left sidebar navigation
  - compact top action bar where appropriate
  - dense tables and status cards
  - dark neutral surfaces with restrained accent colors
  - fast-scanning admin UI rather than a marketing-style dashboard

## Out of Scope

- Per-item manual search
- Rich SPA frontend
- Fine-grained RBAC

## Dependencies

- `T004-auth-bootstrap-and-sessions.md`
- `T008-scheduler-and-run-coordination.md`
- `T009-search-dispatch-and-run-history.md`
- `T010-transmission-guard-and-suppressions.md`

## Implementation Notes

- Favor simple server-rendered HTML over a heavy client app.
- Use Sonarr/Radarr as the closest visual reference point, but do not clone them exactly.
- Preserve the same UX strengths:
  - high information density
  - clear active navigation
  - simple iconography
  - status communicated by color and placement
  - tables and queues that are easy to scan quickly
- Prefer a dark slate/graphite base with one or two strong accent colors, similar to the Servarr family.
- The UI should answer:
  - what happened
  - why it happened
  - what will happen next
  - what is currently suppressed or blocked

## Acceptance Criteria

- Authenticated users can access the operator UI.
- The dashboard shows dependency health, scheduler state, and recent run summaries.
- Candidate preview displays dispatch and skip decisions with reason codes.
- Manual whole-cycle actions work from the UI.
- Suppressions and Transmission removals are visible.

## Test Notes

- Route tests for authenticated vs unauthenticated access.
- UI-level verification that key operator data is rendered.
