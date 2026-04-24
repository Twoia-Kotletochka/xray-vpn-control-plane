# Architecture

## Goals

- Operate reliably on a single VPS without unnecessary moving parts.
- Keep Xray traffic handling fast and predictable.
- Make admin operations safe, observable, and repeatable.
- Preserve a clean migration path toward more nodes or more transport profiles later.

## MVP Architecture

### Runtime Topology

- `xray` container
  - Public VPN entrypoint on `443/tcp` in IP-only mode or the internal Xray backend behind HAProxy in domain mode
  - Default inbound profile: `VLESS + REALITY + XTLS Vision`
  - Xray gRPC API bound internally for stats and user lifecycle operations
- `api` container
  - NestJS REST API on internal Docker network
  - Source of truth for admins, clients, roles, limits, audit logs, backups, and rendered Xray state
- `postgres` container
  - Durable relational store with Prisma migrations
- `caddy` container
  - Serves built admin panel assets
  - Reverse proxies `/api/*` to NestJS
  - Terminates panel TLS on `8443` in IP-only mode or on a DNS name with Let's Encrypt in domain mode
- `haproxy` container
  - Enabled only in domain mode
  - Accepts `80/tcp` and `443/tcp`
  - Routes panel-domain SNI to Caddy and all other TLS traffic on `443` to Xray
- Host-level services
  - Firewall (`ufw` or `nftables`)
  - Fail2ban
  - Docker Engine / Compose
  - Optional cron/systemd timers for backups and cleanup

### Why Xray Stays in Docker

- The official container layout supports config directory mounts and reproducible upgrades.
- Isolation is good enough for a single-node deployment when paired with a read-only filesystem and dropped capabilities.
- It keeps backups, migration, and rollback simpler than mixing host binaries and containerized app services.

### Why Firewall and Fail2ban Stay on the Host

- Network controls are more reliable at the host boundary.
- Containerized ban logic complicates log ingestion and packet filtering.
- A compromised container should not be able to alter the host's security policy.

## Stack Choice

### Backend

- `Node.js 22`
- `TypeScript strict`
- `NestJS`
- `Prisma`
- `PostgreSQL`

Why:

- NestJS gives us modular boundaries, guards, interceptors, DTO validation, and a clear security story.
- Prisma keeps migrations, schema history, and type-safe query code simple for a long-lived control plane.
- TypeScript shared vocabulary between frontend and backend reduces accidental drift.

### Frontend

- `Vite`
- `React`
- `TypeScript`
- `React Router`
- Plain CSS with design tokens for a lightweight admin UI

Why:

- This panel is operational software, not a content site. SSR is optional, so Vite keeps the runtime lighter than Next.js.
- The UI stays fast on a small VPS and easy to migrate into static hosting later if needed.

### Reverse Proxy

- `Caddy`

Why:

- Cleaner TLS and header management than hand-rolled Nginx for this shape of app.
- Easier transition from internal/self-managed TLS to ACME once a domain is provided.

## Xray Design

### Chosen MVP Transport

- Default profile: `VLESS + REALITY + TCP + xtls-rprx-vision`

Why this is the best starting point:

- Low overhead and good throughput on a single VPS.
- No extra domain dependency for the VPN transport itself.
- Strong compatibility with modern Xray ecosystem clients.
- Cleaner topology than adding WebSocket and public TLS only to make the first release work.

Trade-off:

- Some older or less capable clients may prefer `VLESS + WS + TLS`.
- The architecture therefore keeps transport profiles abstracted so we can add a compatibility profile later without reworking the data model.

### Xray Integration Strategy

The backend is the control plane. PostgreSQL is the source of truth. Xray is the data plane.

Flow:

1. Admin changes a client in the panel.
2. API validates domain rules and persists the change.
3. API updates Xray through the internal API whenever the change is dynamic.
4. API writes refreshed rendered config fragments for structural state.
5. API records an audit event.

Dynamic operations expected via Xray API:

- Add user to inbound
- Remove user from inbound
- Read traffic stats per user

Structural operations expected via rendered config + controlled service restart:

- Transport profile changes
- Global routing changes
- REALITY key rotation
- Inbound port changes

This split avoids unnecessary restarts for common client CRUD actions while keeping the generated config authoritative.

## Data Model

### Core Tables

- `admin_users`
  - admin identity
  - password hash
  - role
  - encrypted 2FA secret and recovery state
- `admin_sessions`
  - refresh token hash
  - device/browser metadata
  - expiry and revocation
- `clients`
  - UUID
  - display metadata
  - status
  - subscription token
  - expiry and traffic policies
  - transport profile
- `daily_client_usage`
  - rollups for dashboard and historical charts
- `audit_logs`
  - immutable operator actions
- `backup_snapshots`
  - backup metadata and restore history
- `system_settings`
  - platform-level toggles and future feature flags

## Security Model

### Admin Auth

- Password hashes via bcrypt with configurable work factor
- JWT access token + hashed refresh session storage
- HTTP-only secure cookies in production
- brute-force throttling on auth endpoints
- audit trail for auth success/failure and privileged actions
- optional TOTP-based 2FA
- role split between `SUPER_ADMIN` and `OPERATOR`

### Panel Exposure

- IP-only mode serves the panel behind Caddy on `8443`
- Domain mode serves the panel on `443` through HAProxy SNI routing and Caddy-managed public TLS
- Caddy adds secure headers
- API enforces rate limits and CSRF-safe cookie strategy
- Host firewall should allow panel access only from trusted IP ranges whenever feasible

### Secret Handling

- No live secrets in git
- `.env.example` contains placeholders only
- `.env` and any local secret files are ignored
- REALITY private key, JWT secrets, and admin bootstrap password are operator supplied only

## Single-VPS Reliability

- Compose restart policies on every runtime service
- Container healthchecks for API, DB, Xray, and Caddy
- Postgres data volume separated from runtime containers
- Generated Xray config kept on its own volume/path for easier backup and diffing
- Backup and restore scripts operate on DB and rendered state together
- Automatic local backups run every 5 days with a 14-day retention window

## Known Constraints

- Without a domain, the panel uses internal TLS on `8443` and browsers will warn.
- With a domain, HAProxy routes panel-domain SNI to Caddy while preserving Xray on `443` for existing clients.
- Restore UI is not complete yet; restore currently remains a host-side operator action.
- Logs UX and analytics are still lighter than the rest of the control plane.

## External References

These decisions align with the official Xray documentation:

- Xray official Docker image layout: <https://xtls.github.io/en/document/install.html>
- VLESS inbound with `flow: xtls-rprx-vision`: <https://xtls.github.io/en/config/inbounds/vless.html>
- Xray API `HandlerService` and `StatsService`: <https://xtls.github.io/en/config/api.html>
- Per-user traffic stats keyed by `email`: <https://xtls.github.io/en/config/stats.html>
