# T001: Project Scaffold

Status: Done

## Goal

Create the initial Node.js and TypeScript project skeleton for the service so the rest of the implementation can build on a stable layout.

## Scope

- Initialize the project for Node.js 22 and TypeScript strict mode.
- Establish the top-level `src/` module layout agreed in the implementation blueprint.
- Add package scripts for development, build, lint, test, and container-oriented startup.
- Add a basic Next.js app-router shell with a simple health endpoint.
- Add placeholder module boundaries for:
  - config
  - db
  - auth
  - integrations
  - domain
  - scheduler
  - api
  - ui
  - observability
- Add `.gitignore`, `.editorconfig`, and baseline project metadata files.

## Out of Scope

- Real business logic
- Database schema
- Auth implementation
- API integrations

## Dependencies

- None

## Implementation Notes

- Keep the app as a single long-running service from day one.
- Use Next.js as the UI shell while keeping orchestrator logic in plain TypeScript modules under `src/`.
- Prefer clear directories and explicit naming over clever abstractions.
- Use Turbopack for local development and the standard Next build path for production packaging.

## Acceptance Criteria

- The project installs cleanly.
- TypeScript compiles successfully.
- The service can start and listen on a configurable port.
- The source tree reflects the agreed module boundaries.
- There is a simple README section or note describing how to start the app in development.

## Test Notes

- Verify `pnpm build` succeeds.
- Verify `pnpm dev` starts the server.
- Verify a simple health response is reachable locally.
