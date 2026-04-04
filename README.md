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

## Container packaging

The service is packaged as a single OCI-compatible container using [Containerfile](/home/eddyg/projects/edarr/Containerfile).

Runtime expectations:

- `/config` is mounted read-only
- `/data` is mounted read-write
- the UI/API listens on container port `47892`
- health checks use `GET /api/readyz`

### Build the image

```bash
docker build -f Containerfile -t edarr:local .
```

### Run locally with Docker

```bash
docker run --rm \
  -p 47892:47892 \
  -v "$(pwd)/config:/config:ro" \
  -v "$(pwd)/data:/data" \
  -e APP_SESSION_SECRET=replace-me \
  -e SONARR_API_KEY=replace-me \
  -e RADARR_API_KEY=replace-me \
  -e PROWLARR_API_KEY=replace-me \
  -e TRANSMISSION_RPC_USERNAME=replace-me \
  -e TRANSMISSION_RPC_PASSWORD=replace-me \
  edarr:local
```

### Compose example

Use [compose.example.yaml](/home/eddyg/projects/edarr/compose.example.yaml) as the starting point for Docker or Podman-compatible compose workflows.

### Auth recovery

If you lose access to the built-in admin user, start the container once with:

```bash
RESET_AUTH=true
```

That clears only local users and sessions. It does **not** clear run history, suppressions, or search state. Remove the variable after the recovery boot so the app does not keep resetting auth on every start.

### Podman in WSL

This repo is intended to validate cleanly under Podman in WSL, but the same image is OCI-compatible and can also be tested with Docker where Podman is not available.

Suggested Podman validation flow:

1. `podman build -f Containerfile -t edarr:local .`
2. `podman run --rm -p 47892:47892 ... edarr:local`
3. verify `http://127.0.0.1:47892/api/healthz`
4. verify `http://127.0.0.1:47892/api/readyz`
5. restart the container and confirm `/data/orchestrator.db` state persists

### Unraid deployment notes

- map `/config` to your persistent appdata config directory as read-only
- map `/data` to persistent appdata storage as read-write
- expose `47892/tcp` or remap it to your preferred high port
- keep `restart: unless-stopped`
- use the built-in `/api/readyz` health endpoint for container health checks where available
