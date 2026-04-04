# T002: Config and Startup Validation

Status: Done

## Goal

Implement the configuration system so the service can load YAML config, resolve secrets from environment variables, and fail fast when configuration is invalid.

## Scope

- Define the TypeScript config model.
- Load config from `/config/config.yaml` or an explicit CLI path.
- Resolve secret-bearing fields from environment variables.
- Validate config with a strict schema.
- Surface a redacted effective config view for later UI/API use.
- Implement startup validation errors with clear operator-facing messages.

## Out of Scope

- Auth bootstrap flow
- Database migrations
- External API calls beyond minimal startup URL validation

## Dependencies

- `T001-project-scaffold.md`

## Implementation Notes

- Config must support:
  - server listen address and port
  - mode
  - SQLite path
  - auth settings
  - Sonarr, Radarr, Prowlarr, and Transmission endpoints
  - shared scheduler cadence
  - separate Sonarr and Radarr policies
  - Transmission guard settings
  - safety controls
  - logging level
- Startup should fail if required env-backed secrets are missing.
- Secrets must never appear in logs or redacted config output.

## Acceptance Criteria

- Invalid config prevents service startup.
- Missing required secret env vars prevent service startup.
- Valid config loads into a single runtime object.
- Effective config can be exposed in a redacted form.
- Session TTL validation enforces 7d absolute lifetime and 24h idle timeout defaults unless explicitly changed.

## Test Notes

- Unit tests for valid and invalid config cases.
- Coverage for missing env vars, malformed URLs, and invalid retry ladders.
