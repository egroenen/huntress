# edarr

Deterministic re-search orchestration for Sonarr and Radarr, with an operator UI and Transmission loop protection.

## Development

This project is being built as a single Node.js and TypeScript service with a Next.js app shell.

Current local runtime note:

- The repo is scaffolded to work with Node.js 20 in this WSL environment.
- The intended production container target remains Node.js 22 LTS.

### Start in development

1. Install dependencies with `pnpm install`
2. Export the required secrets:
   - `APP_SESSION_SECRET`
   - `SONARR_API_KEY`
   - `RADARR_API_KEY`
   - `PROWLARR_API_KEY`
   - `TRANSMISSION_RPC_USERNAME`
   - `TRANSMISSION_RPC_PASSWORD`
3. Start the dev server with `pnpm dev`

The Next.js dev server uses its own development port. The app's internal orchestration config still lives in [config/config.yaml](/home/eddyg/projects/edarr/config/config.yaml).

### Tooling

- `pnpm lint` runs ESLint with the Next.js ruleset
- `pnpm lint:fix` applies safe ESLint fixes
- `pnpm format` formats the repo with Prettier
- `pnpm format:check` verifies formatting without changing files
- `pnpm typegen` runs `next typegen`
- `pnpm typecheck` runs type generation and then TypeScript validation
- `pnpm check` is an alias for `pnpm typecheck`

### Current direction

- Next.js app router is the UI shell
- Turbopack is used for local development
- Standard `next build` and `next start` are used for production packaging
- Orchestrator modules remain plain TypeScript modules under `src/`
