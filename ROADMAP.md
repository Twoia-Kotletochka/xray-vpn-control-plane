# Roadmap

## Phase 1: Discovery and Bootstrap

- [x] Define MVP architecture
- [x] Choose stack and deployment model
- [x] Create monorepo skeleton
- [x] Add initial Docker Compose and infra folders
- [x] Add architecture and operator docs

## Phase 2: Backend Core

- [ ] Prisma migrations and seed flow
- [ ] Admin auth with access/refresh flow
- [ ] Client CRUD with expiry and traffic policy model
- [ ] Audit log persistence
- [ ] Xray config rendering service
- [ ] Xray API client for user add/remove/stats
- [ ] Subscription and QR generation

## Phase 3: Frontend Admin Panel

- [ ] Login flow
- [ ] Dashboard widgets and charts
- [ ] Clients table with filters and bulk actions
- [ ] Client detail page with quick actions
- [ ] Config/QR modal and onboarding instructions
- [ ] Server status and logs pages

## Phase 4: Production Hardening

- [ ] Backup and restore end-to-end
- [ ] Host bootstrap automation
- [ ] Fail2ban filters tuned for panel auth noise
- [ ] Caddy production TLS modes
- [ ] Log rotation and retention
- [ ] Secure admin IP allowlisting

## Phase 5: Extended Compatibility

- [ ] Optional additional transport profile for legacy clients
- [ ] Multi-admin roles and 2FA
- [ ] Background jobs for usage rollups and cleanup
- [ ] Import/export workflows
- [ ] Observability improvements and alert hooks

