# xray-vpn-control-plane

Self-hosted Xray control plane for a single VPS or a small private deployment. It combines `Xray-core`, a NestJS API, a React admin panel, backups, audit logs, and bilingual operator UX in one repository.

Self-hosted панель управления Xray для одного VPS или небольшого приватного развёртывания. Репозиторий объединяет `Xray-core`, NestJS API, React-админку, резервные копии, аудит и двуязычный интерфейс оператора.

## English

### What It Includes

- `Xray-core` data plane with `VLESS + REALITY + XTLS Vision` as the default transport profile
- `NestJS + Prisma + PostgreSQL` control plane for admins, clients, roles, limits, audit logs, and backup metadata
- `React + Vite` admin panel with `RU/EN` switching, dashboard, client lifecycle, system status, logs, and backups
- `Docker Compose` deployment for `api`, `postgres`, `xray`, and `caddy`
- Scheduled local backups, host-side restore flow, import/export, public subscriptions, and TOTP 2FA for admin access

### Quick Start

1. Copy [`.env.example`](./.env.example) to `.env`.
2. Replace every placeholder secret and generate REALITY keys with `xray x25519`.
3. Review [DEPLOY.md](./DEPLOY.md) and run `docker compose up -d --build`.
4. Open the panel on `https://YOUR_HOST:8443`, or attach a DNS name later for a public CA-signed certificate.

### Documentation

| Topic | English | Russian |
| --- | --- | --- |
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) | [docs/ru/ARCHITECTURE.md](./docs/ru/ARCHITECTURE.md) |
| Deployment | [DEPLOY.md](./DEPLOY.md) | [docs/ru/DEPLOY.md](./docs/ru/DEPLOY.md) |
| Security | [SECURITY.md](./SECURITY.md) | [docs/ru/SECURITY.md](./docs/ru/SECURITY.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) | [docs/ru/ROADMAP.md](./docs/ru/ROADMAP.md) |
| Admin Guide | [docs/ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md) | [docs/ru/ADMIN_GUIDE.md](./docs/ru/ADMIN_GUIDE.md) |
| User Guide | [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | [docs/ru/USER_GUIDE.md](./docs/ru/USER_GUIDE.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | [docs/ru/TROUBLESHOOTING.md](./docs/ru/TROUBLESHOOTING.md) |


## Русский

### Что Уже Есть

- data plane на `Xray-core` с профилем `VLESS + REALITY + XTLS Vision` по умолчанию
- control plane на `NestJS + Prisma + PostgreSQL` для админов, клиентов, ролей, лимитов, аудита и метаданных резервных копий
- админ-панель на `React + Vite` с переключением `RU/EN`, дашбордом, управлением клиентами, статусом сервера, логами и резервными копиями
- развёртывание через `Docker Compose` для `api`, `postgres`, `xray` и `caddy`
- плановые локальные бэкапы, host-side restore, import/export, публичные подписки и `TOTP 2FA` для админского доступа

### Быстрый Старт

1. Скопируй [`.env.example`](./.env.example) в `.env`.
2. Замени все плейсхолдеры на реальные секреты и сгенерируй ключи REALITY командой `xray x25519`.
3. Проверь [DEPLOY.md](./DEPLOY.md) и запусти `docker compose up -d --build`.
4. Открой панель по адресу `https://ВАШ_ХОСТ:8443`, а домен и публичный сертификат можно подключить позже.
