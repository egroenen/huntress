# huntress

Deterministic re-search orchestration for Sonarr and Radarr, with an operator UI and Transmission loop protection.

## Development

This project is being built as a single Node.js and TypeScript service with a Next.js app shell.

Current local runtime note:

- The repo is scaffolded to work with Node.js 20 in this WSL environment.
- The intended production container target remains Node.js 22 LTS.

### Start in development

1. Install dependencies with `pnpm install`
2. Start the dev server with `pnpm dev`

The Next.js dev server uses its own development port. The app's internal orchestration config still lives in [config/config.yaml](/home/eddyg/projects/huntress/config/config.yaml).

Startup behavior:

- If no admin user exists yet, the app redirects to `/setup`.
- If Sonarr, Radarr, Prowlarr, or Transmission credentials are missing, the app still boots and exposes the settings page so you can configure them in-app.
- If `APP_SESSION_SECRET` is not set, huntress auto-generates and persists one locally.
- In local development, if the sample `/data/...` SQLite path is not writable, huntress falls back to a repo-local `./data/...` path automatically.

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

The service is packaged as a single OCI-compatible container using [Containerfile](/home/eddyg/projects/huntress/Containerfile).

Runtime expectations:

- `/config` is mounted read-only when you want the host to own `config.yaml`
- `/data` is mounted read-write
- the UI/API listens on container port `47892`
- health checks use `GET /api/readyz`
- if `/config/config.yaml` is missing, the container falls back to the bundled sample config

### Build the image

```bash
docker build -f Containerfile -t huntress:local .
```

### Run locally with Docker

```bash
docker run --rm \
  -p 47892:47892 \
  -v "$(pwd)/config:/config:ro" \
  -v "$(pwd)/data:/data" \
  huntress:local
```

You can still supply env vars for secrets in container deployments if you want them to override the saved in-app settings, but they are no longer required for first boot.

### Compose example

Use [compose.example.yaml](/home/eddyg/projects/huntress/compose.example.yaml) as the starting point for Docker or Podman-compatible compose workflows.

### Build for Unraid

Unraid installs images from a registry or from images already loaded onto the host.

Registry flow:

```bash
docker build -f Containerfile -t ghcr.io/YOUR_ACCOUNT/huntress:latest .
docker push ghcr.io/YOUR_ACCOUNT/huntress:latest
```

Local import flow:

```bash
docker build -f Containerfile -t huntress:local .
docker save huntress:local -o huntress-local.tar
```

Copy the tarball to Unraid and load it with `docker load -i /path/to/huntress-local.tar`.

Detailed Unraid setup steps live in [docs/unraid.md](/home/eddyg/projects/huntress/docs/unraid.md).

### Auth recovery

If you lose access to the built-in admin user, start the container once with:

```bash
RESET_AUTH=true
```

That clears only local users and sessions. It does **not** clear run history, suppressions, or search state. Remove the variable after the recovery boot so the app does not keep resetting auth on every start.

### Podman in WSL

This repo is intended to validate cleanly under Podman in WSL, but the same image is OCI-compatible and can also be tested with Docker where Podman is not available.

Suggested Podman validation flow:

1. `podman build -f Containerfile -t huntress:local .`
2. `podman run --rm -p 47892:47892 ... huntress:local`
3. verify `http://127.0.0.1:47892/api/healthz`
4. verify `http://127.0.0.1:47892/api/readyz`
5. restart the container and confirm `/data/huntress.db` state persists

### Unraid deployment notes

- map `/config` to your persistent appdata config directory
- map `/data` to persistent appdata storage as read-write
- expose `47892/tcp` or remap it to your preferred high port
- keep `restart: unless-stopped`
- use the built-in `/api/readyz` health endpoint for container health checks where available
- if `/config/config.yaml` is absent, the image will boot from the bundled sample config
- for a full walkthrough, use [docs/unraid.md](/home/eddyg/projects/huntress/docs/unraid.md)

## Pre-live checklist

Before switching from dry-run to live mode:

1. Keep conservative starting budgets in [config/config.yaml](/home/eddyg/projects/huntress/config/config.yaml), especially:
   - `safety.max_global_dispatch_per_cycle`
   - `safety.rolling_search_limits.per_15m`
   - `safety.rolling_search_limits.per_1h`
   - `safety.rolling_search_limits.per_24h`
2. Run the service in `dry-run` mode long enough to confirm:
   - expected Sonarr and Radarr items appear in the candidate view
   - skipped items have understandable reason codes
   - queued items are being skipped instead of re-searched
3. Confirm the operator UI shows search budget visibility on the overview page:
   - used versus remaining budget
   - next eligible dispatch time
   - throttle reason when a budget is exhausted
4. Confirm the metrics endpoint exposes throttle and rate data:
   - `huntress_search_rate_used`
   - `huntress_search_rate_remaining`
   - `huntress_search_throttles_total`
5. Exercise throttle-stop behavior in a safe environment:
   - temporarily lower `rolling_search_limits.per_15m`
   - confirm dispatch stops when the window fills
   - confirm dispatch resumes only after the next eligible time
6. Confirm Transmission guard behavior before trusting it live:
   - review recent removals in the Transmission page
   - confirm suppressions appear and expire as expected
   - verify `delete_local_data` matches your actual preference
7. Confirm readiness behavior matches your expectation:
   - `/api/healthz` should be `200` when the process is up
   - `/api/readyz` should only be `200` when the service can operate against its dependencies
8. Back up `/data/huntress.db` before the first live enablement.
9. Only then switch `mode` from `dry-run` to `live` and watch the first few cycles closely in the run history and overview pages.
