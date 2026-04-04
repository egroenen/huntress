# T012: Observability and Health

Status: Backlog

## Goal

Make the service easy to trust and debug through structured logging, health endpoints, readiness checks, and Prometheus-friendly metrics.

## Scope

- Add structured JSON logging with consistent event names.
- Add `/healthz` and `/readyz`.
- Add `/metrics`.
- Expose status information used by the UI and by container health checks.
- Record clear run-summary and decision logs.
- Record explicit search-throttle and search-budget events.
- Ensure secrets are redacted everywhere.

## Out of Scope

- External alerting integrations
- Log shipping setup

## Dependencies

- `T002-config-and-startup-validation.md`
- `T008-scheduler-and-run-coordination.md`
- `T009-search-dispatch-and-run-history.md`

## Implementation Notes

- Logs should include `runId` whenever a cycle is involved.
- Metrics should at minimum cover:
  - run duration
  - run status counts
  - candidates
  - dispatches
  - skips by reason code
  - throttles by reason code
  - rolling search counts
  - remaining search budget in key windows
  - active suppressions
  - dependency health
- `/readyz` should reflect whether the service can actually operate, not just whether the process is up.
- The service should expose enough information for the UI to answer:
  - how many searches ran in the last 15m, 1h, and 24h
  - why dispatch is currently throttled
  - when search dispatch becomes eligible again

## Acceptance Criteria

- Structured logs are emitted for startup, auth, runs, candidate evaluation, dispatch, and Transmission actions.
- Health and readiness endpoints behave predictably.
- Metrics can be scraped in Prometheus format.
- Search-rate limiting and throttle state are observable without reading the SQLite database directly.
- No secrets appear in logs or status output.

## Test Notes

- Endpoint tests for health, readiness, and metrics.
- Logging tests or assertions around redaction behavior.
- Assertions around throttle metrics and throttle event emission.
