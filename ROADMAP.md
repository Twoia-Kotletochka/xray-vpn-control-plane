# Roadmap

## Completed Foundation

- [x] Single-node architecture for `api`, `postgres`, `xray`, and `caddy`
- [x] Prisma schema, migrations, seed flow, and persistent PostgreSQL storage
- [x] Admin authentication with access/refresh tokens and audit logging
- [x] Client lifecycle CRUD, traffic resets, expiry handling, and import/export
- [x] Live Xray sync, stats snapshots, quota enforcement, and public subscriptions
- [x] React admin panel with dashboard, clients, logs, backups, help, and `RU/EN` switching
- [x] TOTP 2FA and a basic role split between `SUPER_ADMIN` and `OPERATOR`
- [x] Scheduled local backups with automatic retention cleanup

## In Progress Toward a Stronger Public Release

- [ ] Safer UI restore flow on top of the existing host-side restore script
- [ ] Richer analytics and historical usage views
- [ ] Better logs UX with filtering and deeper operator workflows
- [ ] Simpler panel-domain onboarding and public TLS automation

## Next Expansion Options

- [ ] Additional transport profiles for compatibility-focused deployments
- [ ] Offsite backup shipping and disaster recovery workflows
- [ ] Alerting and webhook integrations
- [ ] Multi-node orchestration
