# Deploy

## Target Shape

This project is designed for a single VPS with `Docker Compose`.

Recommended baseline:

- Debian 12 or Ubuntu 24.04 LTS
- public IPv4
- root or sudo access
- Docker Engine with the Compose plugin

## Network Layout

- `443/tcp` -> `Xray-core`
- `8443/tcp` -> admin panel via `Caddy`
- SSH remains on the operator-chosen port

## Fastest First Install

Use the guided installer if you want the smallest number of manual steps:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/server-vpn.git /opt/server-vpn
cd /opt/server-vpn
sudo bash install.sh
```

`install.sh` runs host bootstrap, creates `.env` from `.env.example` when needed, generates missing secrets and REALITY keys, and then executes `infra/scripts/deploy.sh`.

## Manual Fresh VPS Flow

```bash
sudo git clone https://github.com/Twoia-Kotletochka/server-vpn.git /opt/server-vpn
cd /opt/server-vpn
sudo bash infra/scripts/bootstrap-server.sh
cp .env.example .env
```

Generate the values below before editing `.env`:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # TOTP_ENCRYPTION_SECRET
openssl rand -hex 8    # XRAY_SHORT_IDS
docker run --rm ghcr.io/xtls/xray-core:26.2.6 x25519
```

The `x25519` command prints a private/public key pair for:

- `XRAY_REALITY_PRIVATE_KEY`
- `XRAY_REALITY_PUBLIC_KEY`

## Values You Must Set

- `PANEL_HOST`
- `PANEL_PUBLIC_URL`
- `XRAY_SUBSCRIPTION_BASE_URL`
- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `TOTP_ENCRYPTION_SECRET`
- `INITIAL_ADMIN_*`
- `XRAY_REALITY_PRIVATE_KEY`
- `XRAY_REALITY_PUBLIC_KEY`
- `XRAY_SHORT_IDS`

Notes:

- If you do not have a domain yet, set `PANEL_HOST`, `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL`, and `API_CORS_ORIGIN` to the VPS public IP with `:8443`.
- `INITIAL_ADMIN_*` becomes the first panel account created by the seed step.
- `XRAY_SHORT_IDS` accepts one or more 16-character hex values separated by commas.
- `BACKUP_HOST_DIR` can stay empty on first install; `deploy.sh` will normalize it to `<repo>/infra/backup/output`.

## TLS and DNS

- The VPN transport itself does not require a panel domain.
- The default panel deployment serves HTTPS on `8443` with Caddy's internal certificate.
- Browsers will show a warning until you trust that CA or place the panel behind your own public certificate setup.
- Port `443` is intentionally reserved for `Xray`, so the panel stays on `8443` in the default layout.

## First Deploy

```bash
bash infra/scripts/deploy.sh
```

## Verification After Deploy

```bash
docker compose ps
curl -k https://YOUR_HOST:8443/healthz
curl -k https://YOUR_HOST:8443/readyz
```

Then:

1. log in with `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`
2. create a test client
3. verify a real connection from a supported Xray client

## Backups and Restore

- Local backups are created automatically every 5 days.
- Archives older than 14 days are pruned automatically.
- Restore remains a host-side operator action:

```bash
./infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz
./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz
```
