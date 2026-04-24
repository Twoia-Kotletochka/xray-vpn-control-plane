# Deploy

## Target Shape

This project is designed for a single VPS with `Docker Compose`.

Recommended baseline:

- Debian 12 or Ubuntu 24.04 LTS
- public IPv4
- root or sudo access
- Docker Engine with the Compose plugin

## Network Layout

- IP-only mode: `443/tcp` -> `Xray-core`, `8443/tcp` -> admin panel via `Caddy`
- Domain mode: `80/tcp` and `443/tcp` -> `HAProxy`; panel-domain SNI goes to `Caddy`, everything else on `443` goes to `Xray-core`; `8443/tcp` remains a legacy direct panel/subscription fallback
- SSH remains on the operator-chosen port

## Fastest First Install

Use the guided installer if you want the smallest number of manual steps. In the normal interactive flow it asks only for the server IP or panel domain.

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh
```

`install.sh` runs host bootstrap, creates `.env` from `.env.example`, generates every missing secret automatically, provisions REALITY keys, deploys the stack, and stores the initial admin credentials in `/root/.server-vpn-install.txt`.

For non-interactive automation:

```bash
sudo bash install.sh --host 203.0.113.10 --non-interactive
```

Optional advanced overrides still exist for `--admin-username`, `--admin-email`, and `--admin-password`, but they are no longer required for the standard install path.

Installer mode selection:

- Enter an IP address for IP-only mode. The panel will use `https://IP:8443` with Caddy internal TLS.
- Enter a DNS name for domain mode. The panel will use `https://DOMAIN` with Let's Encrypt, while VPN clients still reach Xray on `443/tcp`. `https://IP:8443` remains available for old subscription URLs.

## Advanced Manual Fresh VPS Flow

Use this path only if you explicitly want to manage `.env` and the secrets yourself.

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
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
- `PANEL_TLS_MODE`
- `PANEL_PUBLIC_URL`
- `XRAY_PUBLIC_HOST`
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

- Without a domain, set `PANEL_TLS_MODE=ip` and use the VPS public IP with `:8443` for `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL`, and `API_CORS_ORIGIN`.
- With a domain, set `PANEL_TLS_MODE=domain`, point the domain to the VPS, and use `https://DOMAIN` without a port for `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL`, and `API_CORS_ORIGIN`.
- `XRAY_PUBLIC_HOST` controls what host appears in generated VLESS links. It can be the VPS IP or your domain.
- `INITIAL_ADMIN_*` becomes the first panel account created by the seed step.
- `XRAY_SHORT_IDS` accepts one or more 16-character hex values separated by commas.
- `BACKUP_HOST_DIR` can stay empty on first install; `deploy.sh` will normalize it to `<repo>/infra/backup/output`.

## TLS and DNS

- The VPN transport itself does not require a panel domain.
- IP-only mode serves the panel on `8443` with Caddy's internal certificate, so browsers show a warning.
- Domain mode uses HAProxy SNI routing on `443`: browser SNI for the panel domain goes to Caddy and all other TLS traffic goes to Xray.
- Domain mode also keeps `8443` published to Caddy with internal TLS, so older subscription URLs using `https://IP:8443` can still refresh.
- Existing VLESS links that use the server IP on `443` keep working in domain mode as long as their REALITY SNI stays unchanged.

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

For domain mode:

```bash
docker compose -f docker-compose.yml -f docker-compose.domain.yml ps
curl -fsS https://YOUR_DOMAIN/healthz
curl -fsS https://YOUR_DOMAIN/readyz
```

Then:

1. log in with the generated `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD`
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
