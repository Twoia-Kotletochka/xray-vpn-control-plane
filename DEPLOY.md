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

## Fresh VPS Flow

1. Clone the repository.
2. Copy [`.env.example`](./.env.example) to `.env`.
3. Replace every placeholder secret.
4. Generate REALITY keys with `xray x25519`.
5. Review `infra/scripts/bootstrap-server.sh` if the host is not prepared yet.
6. Start the stack with `docker compose up -d --build`.

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

## TLS and DNS

- The VPN transport itself does not require a panel domain.
- The panel can run on an IP with `PANEL_TLS_MODE=internal`.
- A public CA-signed certificate for the panel requires a real DNS name.
- Port `443` is intentionally reserved for `Xray`, so the panel stays on `8443` in the default layout.

## Verification After Deploy

```bash
docker compose ps
curl -k https://YOUR_HOST:8443/healthz
curl -k https://YOUR_HOST:8443/readyz
```

Then log in to the panel, create a test client, and verify a real connection from a supported Xray client.

## Backups and Restore

- Local backups are created automatically every 5 days.
- Archives older than 14 days are pruned automatically.
- Restore remains a host-side operator action:

```bash
./infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz
./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz
```
