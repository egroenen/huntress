# Ticket Backlog

This directory contains the initial implementation backlog for the Arr re-search orchestrator.

The tickets are written as plain Markdown so they can be worked through in order, refined, or split later without introducing a separate tracking system.

## Recommended build order

1. `T001-project-scaffold.md`
2. `T002-config-and-startup-validation.md`
3. `T003-database-and-migrations.md`
4. `T004-auth-bootstrap-and-sessions.md`
5. `T005-external-client-foundations.md`
6. `T006-arr-state-sync.md`
7. `T007-decision-engine-and-reason-codes.md`
8. `T008-scheduler-and-run-coordination.md`
9. `T009-search-dispatch-and-run-history.md`
10. `T010-transmission-guard-and-suppressions.md`
11. `T011-operator-ui.md`
12. `T012-observability-and-health.md`
13. `T013-containerization-and-runtime-packaging.md`
14. `T014-test-harness-and-hardening.md`
15. `T015-release-selection-and-upgrade-escalation.md`
16. `T016-search-rate-controls-and-budget-visibility.md`

## Notes

- The backlog is intentionally shaped around the agreed MVP.
- Each ticket is sized to be meaningful but still implementable in a focused pass.
- The tickets assume a single Sonarr, single Radarr, single Prowlarr, and single Transmission instance.
- Multi-instance support is explicitly deferred.
- The UI remains operational and lightweight, not a full SPA-first dashboard.
- Each ticket should carry a top-level `Status` field using: `Backlog`, `In Progress`, `Testing`, or `Done`.
- `T015` is intentionally post-MVP. It expands the orchestrator from “decide what to search” into “participate in which release to accept.”
- `T016` is high-value even if it lands late. Search-rate protection and visibility are essential for private-tracker-safe operation.
