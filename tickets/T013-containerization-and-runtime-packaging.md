# T013: Containerization and Runtime Packaging

Status: Backlog

## Goal

Package the service as an OCI-compatible container that works cleanly with Podman in WSL and Docker on Unraid.

## Scope

- Add a production-ready `Dockerfile` or `Containerfile`.
- Support:
  - `/config` read-only mount
  - `/data` read-write mount
  - one exposed UI/API port
- Add a sample compose file compatible with common Docker and Podman workflows.
- Add container healthcheck wiring.
- Document `RESET_AUTH=true` usage for recovery.
- Document Podman-in-WSL development validation flow.
- Document Unraid deployment expectations.

## Out of Scope

- Full CI/CD publishing
- Registry automation

## Dependencies

- `T001-project-scaffold.md`
- `T002-config-and-startup-validation.md`
- `T004-auth-bootstrap-and-sessions.md`
- `T012-observability-and-health.md`

## Implementation Notes

- Keep the image single-process and simple.
- Prefer non-root execution where practical.
- Avoid Docker-only features that could complicate Podman use.

## Acceptance Criteria

- The app builds into an OCI-compatible image.
- The image runs successfully under Podman in WSL.
- The container uses persistent storage correctly for DB-backed state.
- Health checks work in-container.
- Recovery and configuration mounts are documented clearly.

## Test Notes

- Manual container validation under Podman.
- Restart and persistence validation across container restarts.
