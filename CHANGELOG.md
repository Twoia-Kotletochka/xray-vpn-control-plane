# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-20

- Bootstrapped monorepo structure for API, web panel, and infra.
- Added MVP architecture, roadmap, deployment, and security docs.
- Added initial Docker Compose topology and operational script skeletons.
- Added real backend auth flow with refresh sessions, bootstrap admin creation, and in-memory brute-force protection.
- Added Prisma-backed client lifecycle APIs: list, detail, create, update, extend, delete, traffic reset, and dashboard summary.
- Added VLESS + REALITY subscription generation and per-client config bundle endpoint.
- Added Russian-localized web panel with authenticated routes, live dashboard, client management, subscriptions, admin users, audit feed, and system status views.
- Added live Xray control API integration for client sync, runtime reconciliation, and periodic traffic snapshots into PostgreSQL.
- Added quota enforcement, richer system probes, QR modal UX, editable client limits/statuses, and public client subscription delivery behind Caddy without exposing the admin panel.
- Added file-based runtime logs, panel log tail viewer, backup archive management, and JSON import/export for client records.

## [0.2.0] - 2026-05-03

- Added first-class `WireGuard` transport support alongside `VLESS + REALITY` without removing existing Xray delivery.
- Added Prisma schema changes for per-client transport toggles and persistent WireGuard peer state.
- Added automatic legacy-client backfill so existing clients can receive WireGuard configs in the background without breaking active VLESS access.
- Added dual delivery variants for both transports: preferred domain endpoint plus direct IP fallback for operator-controlled issuance.
- Added a host-networked WireGuard runtime service in Docker Compose with generated server config sync, runtime dump export, and healthchecks.
- Added WireGuard client bundle generation with `.conf` export, QR support, platform guides, and transport switching in the admin panel.
- Added WireGuard status visibility in the server status view, log source wiring, and API serialization for assigned tunnel IP and handshake metadata.
- Fixed a client-page regression where opening a client card unnecessarily reloaded the full client list.
