# server-vpn

Self-hosted VPN control plane for a single VPS, built around Xray-core and VLESS with a modern admin panel.

## Status

This repository currently contains the architecture baseline and bootstrap skeleton for the first working release:

- NestJS backend skeleton with modular domain boundaries.
- Vite + React admin panel skeleton with a production-minded layout.
- Docker Compose topology for `api`, `postgres`, `xray`, and `caddy`.
- Initial operational docs and server bootstrap scripts.
- Security-first secret handling via `.env.example` and ignored local files.

## Why This Shape

- `VLESS + REALITY + XTLS Vision` is the default transport profile for the first release.
- Port `443` is reserved for Xray to maximize client compatibility.
- The admin panel is served on `8443` behind Caddy in the MVP, because no panel domain was provided yet.
- Firewall and Fail2ban stay on the host, where they are more reliable than containerized equivalents.

## Repository Layout

```text
.
|-- apps/
|   |-- api/         # NestJS API, Prisma schema, Xray integration layer
|   `-- web/         # React admin panel
|-- infra/
|   |-- caddy/       # Reverse proxy config
|   |-- docker/      # Dockerfiles
|   |-- fail2ban/    # Host-level jails and filters
|   |-- scripts/     # Bootstrap, deploy, backup, restore
|   `-- xray/        # Xray templates and runtime notes
|-- docs/            # Operator and user-facing docs
|-- ARCHITECTURE.md
|-- ROADMAP.md
|-- DEPLOY.md
|-- SECURITY.md
`-- docker-compose.yml
```

## Local Bootstrap

1. Copy `.env.example` to `.env`.
2. Replace every placeholder secret in `.env`.
3. Install dependencies with `npm install`.
4. Start local app development with `npm run dev`.

## Docker Bootstrap

1. Fill in `.env` with production values.
2. Review `infra/caddy/Caddyfile` and `infra/scripts/bootstrap-server.sh`.
3. Run `docker compose up -d --build`.

## Documents

- [Architecture](./ARCHITECTURE.md)
- [Roadmap](./ROADMAP.md)
- [Deploy](./DEPLOY.md)
- [Security](./SECURITY.md)
- [Admin Guide](./docs/ADMIN_GUIDE.md)
- [User Guide](./docs/USER_GUIDE.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)

## Security Notes

- Never commit `.env` with real values.
- Never commit Xray REALITY private keys or live client links.
- Keep the panel behind firewall allowlists whenever possible.
- Treat the generated subscription URLs as credentials.

