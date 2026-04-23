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

1. Clone the repository onto the target VPS.
2. Run `sudo bash install.sh` and enter only the server IP or host when prompted.
3. Open the panel on `https://YOUR_HOST:8443` and sign in with the generated admin credentials.
4. Review [DEPLOY.md](./DEPLOY.md) if you prefer the manual path or want to customize the rollout.

### Common Install Examples

One-prompt install with the VPS public address:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh
```

The installer bootstraps the host, generates every required secret automatically, provisions REALITY keys, deploys the stack, and stores the generated admin credentials in `/root/.server-vpn-install.txt`.

Non-interactive install for automation:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh \
  --host 203.0.113.10 \
  --non-interactive
```

Advanced overrides for `--admin-*` still exist, but they are optional. In the normal path the installer asks only for the server IP or host and generates the rest itself.

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

### Scope and Current State

- Built for operators who want a single-node Xray control plane without Kubernetes or external SaaS dependencies
- Production-oriented, but still evolving toward a more complete public release
- Current gaps are focused on richer analytics, logs UX, and panel-domain automation

## Русский

### Что Уже Есть

- data plane на `Xray-core` с профилем `VLESS + REALITY + XTLS Vision` по умолчанию
- control plane на `NestJS + Prisma + PostgreSQL` для админов, клиентов, ролей, лимитов, аудита и метаданных резервных копий
- админ-панель на `React + Vite` с переключением `RU/EN`, дашбордом, управлением клиентами, статусом сервера, логами и резервными копиями
- развёртывание через `Docker Compose` для `api`, `postgres`, `xray` и `caddy`
- плановые локальные бэкапы, host-side restore, import/export, публичные подписки и `TOTP 2FA` для админского доступа

### Быстрый Старт

1. Клонируй репозиторий на VPS.
2. Выполни `sudo bash install.sh` и укажи только IP или host сервера.
3. Открой панель по адресу `https://ВАШ_ХОСТ:8443` и войди с автоматически сгенерированными admin-данными.
4. Если нужен ручной путь или более тонкая настройка, смотри [DEPLOY.md](./DEPLOY.md).

### Частые Примеры Запуска

One-prompt установка по публичному IP VPS:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh
```

`install.sh` сам подготовит хост, создаст `.env`, сгенерирует все секреты, REALITY keypair, выполнит деплой и сохранит стартовые admin-данные в `/root/.server-vpn-install.txt`.

Non-interactive установка для automation/provisioning:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh \
  --host 203.0.113.10 \
  --non-interactive
```

Флаги `--admin-*` оставлены только как advanced override. В обычном сценарии ничего вручную генерировать и вводить, кроме IP/host, не нужно.

### Для Чего Этот Репозиторий

- для операторов, которым нужен single-node control plane для Xray без Kubernetes и внешних SaaS-зависимостей
- для быстрого развёртывания на своём VPS с понятной структурой и прозрачными скриптами
- для дальнейшей публикации стабильных релизов в отдельный публичный репозиторий без внутренних эксплуатационных артефактов

## Security Notes

- Never commit `.env` with real values.
- Never commit REALITY private keys or live subscription URLs.
- Treat generated client links and subscription feeds as credentials.
- Keep the admin panel behind firewall allowlists whenever possible.
