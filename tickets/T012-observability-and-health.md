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
  - active suppressions
  - dependency health
- `/readyz` should reflect whether the service can actually operate, not just whether the process is up.

## Acceptance Criteria

- Structured logs are emitted for startup, auth, runs, candidate evaluation, dispatch, and Transmission actions.
- Health and readiness endpoints behave predictably.
- Metrics can be scraped in Prometheus format.
- No secrets appear in logs or status output.

## Test Notes

- Endpoint tests for health, readiness, and metrics.
- Logging tests or assertions around redaction behavior.
