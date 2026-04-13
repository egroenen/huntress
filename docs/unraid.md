# Unraid Installation

This guide assumes you already have a built `huntress` image and want to install it through the Unraid Docker UI.

## Image options

You have two practical ways to get the image onto your Unraid box.

### Option 1: Push it to a registry

Build and publish from this repo:

```bash
docker build -f Containerfile -t ghcr.io/YOUR_ACCOUNT/huntress:latest .
docker push ghcr.io/YOUR_ACCOUNT/huntress:latest
```

Then use `ghcr.io/YOUR_ACCOUNT/huntress:latest` as the repository in Unraid.

### Option 2: Import a local image tarball

Build and export from the machine where you have this repo:

```bash
docker build -f Containerfile -t huntress:local .
docker save huntress:local -o huntress-local.tar
```

Copy `huntress-local.tar` to your Unraid server, then load it over SSH:

```bash
docker load -i /path/to/huntress-local.tar
```

After that, use the loaded local tag, such as `huntress:local`, in Unraid.

## Host folders

Create these folders on Unraid before starting the container:

```text
/mnt/user/appdata/huntress/config
/mnt/user/appdata/huntress/data
```

`/config` is where an optional `config.yaml` can live.

`/data` is where Huntress stores the SQLite database and other persistent state.

## Config file behavior

Huntress looks for configuration in this order:

1. `/config/config.yaml`
2. the bundled `./config/config.yaml` inside the image

That means a fresh Unraid install will still boot even if `/mnt/user/appdata/huntress/config/config.yaml` does not exist yet.

If you want to control file-backed defaults like `mode`, scheduler cadence, or rolling safety limits, copy this repo's [config/config.yaml](/home/eddyg/projects/huntress/config/config.yaml) into your Unraid config folder as `/mnt/user/appdata/huntress/config/config.yaml`, edit it there, and restart the container.

## Unraid container settings

In Unraid:

1. Open `Docker`.
2. Choose `Add Container`.
3. Set `Name` to `huntress`.
4. Set `Repository` to your image tag, for example `ghcr.io/YOUR_ACCOUNT/huntress:latest` or `huntress:local`.
5. Set `Network Type` to `bridge`.
6. Add port `47892` container to your preferred host port, for example `47892`.
7. Add path `/config` mapped to `/mnt/user/appdata/huntress/config`.
8. Add path `/data` mapped to `/mnt/user/appdata/huntress/data`.
9. Mark `/config` as read-only if you want the container to use only host-managed config files.
10. Leave `/data` read-write.

Optional environment variables:

- `TZ` for your timezone
- `APP_SESSION_SECRET` if you want to provide the session secret explicitly instead of letting Huntress persist one
- `SONARR_API_KEY`, `RADARR_API_KEY`, `PROWLARR_API_KEY`, `TRANSMISSION_RPC_USERNAME`, `TRANSMISSION_RPC_PASSWORD` if you prefer env-driven secrets over in-app saved settings
- `RESET_AUTH=true` for a one-time admin reset recovery boot

## First boot

After the container starts:

1. Open `http://UNRAID_IP:HOST_PORT`.
2. If no admin exists yet, Huntress will redirect you to `/setup`.
3. Create the first admin account.
4. Open `Settings` and enter your Sonarr, Radarr, Prowlarr, and Transmission connection details.
5. Restart the container only if you changed the file-based config under `/config/config.yaml`.

## Updates

To update:

1. Build and push a new image tag, or load a new tarball.
2. Update the repository/tag in Unraid if needed.
3. Recreate the container.
4. Keep the same `/config` and `/data` mappings so state persists.

## Recovery

If you lose access to the built-in admin account, start the container once with:

```text
RESET_AUTH=true
```

That clears only local users and sessions. Remove the variable after the recovery boot so it does not keep resetting auth on every start.
