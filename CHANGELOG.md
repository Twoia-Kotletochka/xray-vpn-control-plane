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
