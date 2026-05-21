# Xray VPN Control Plane

Self-hosted control plane for `Xray-core` VPN deployments on a single VPS. It provides a web admin panel, API, PostgreSQL storage, client lifecycle management, traffic limits, backups, audit logs, and guided deployment with either IP-only access or a real domain.

Самостоятельно размещаемая панель управления `Xray-core` VPN для одного VPS. Включает web-панель, API, PostgreSQL, управление клиентами, лимиты трафика, бэкапы, аудит и установку как по IP, так и по домену.

## Highlights

- `VLESS + REALITY + XTLS Vision` as the default Xray transport.
- Optional WireGuard transport managed from the same panel.
- Admin roles: `SUPER_ADMIN` and `OPERATOR`.
- Client CRUD, QR codes, subscription URLs, expiry dates, traffic quotas, IP/device limits, and live online status.
- Dashboard, traffic analytics, logs, backups, restore preflight, audit log, and system status.
- `RU / EN` interface switch.
- Guided installer that asks only for the server IP or domain in the normal path.

## Quick Start

Requirements:

- fresh Debian 12 or Ubuntu 24.04 VPS;
- public IPv4;
- root or sudo access;
- open `443/tcp` for VPN traffic;
- open `8443/tcp` for IP-only panel mode, or `80/tcp` and `443/tcp` for domain mode.

Install:

```bash
sudo git clone https://github.com/<owner>/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh
```

The installer prepares the host, creates `.env`, generates secrets and transport keys, deploys Docker Compose services, and prints a final login summary. Generated admin credentials are stored locally on the server at `/root/.xray-vpn-control-plane-install.txt`.

For automation:

```bash
sudo bash install.sh --host 203.0.113.10 --non-interactive
```

Use a domain instead of an IP if you want the panel on `https://DOMAIN` with Let's Encrypt. Existing Xray traffic still stays on `443/tcp` through SNI routing.

## Deployment Modes

| Mode | Panel URL | VPN entrypoint | Notes |
| --- | --- | --- | --- |
| IP-only | `https://IP:8443` | `IP:443` | Uses Caddy internal TLS, so browsers show a certificate warning. |
| Domain | `https://DOMAIN` | `DOMAIN_OR_IP:443` | Uses HAProxy SNI routing and Let's Encrypt for the panel domain. |

Domain mode keeps `https://IP:8443` available as a fallback for old subscription URLs and emergency panel access.

## Documentation

| Topic | English | Русский |
| --- | --- | --- |
| Architecture | [ARCHITECTURE.md](./ARCHITECTURE.md) | [docs/ru/ARCHITECTURE.md](./docs/ru/ARCHITECTURE.md) |
| Deployment | [DEPLOY.md](./DEPLOY.md) | [docs/ru/DEPLOY.md](./docs/ru/DEPLOY.md) |
| Security | [SECURITY.md](./SECURITY.md) | [docs/ru/SECURITY.md](./docs/ru/SECURITY.md) |
| Roadmap | [ROADMAP.md](./ROADMAP.md) | [docs/ru/ROADMAP.md](./docs/ru/ROADMAP.md) |
| Admin guide | [docs/ADMIN_GUIDE.md](./docs/ADMIN_GUIDE.md) | [docs/ru/ADMIN_GUIDE.md](./docs/ru/ADMIN_GUIDE.md) |
| User guide | [docs/USER_GUIDE.md](./docs/USER_GUIDE.md) | [docs/ru/USER_GUIDE.md](./docs/ru/USER_GUIDE.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | [docs/ru/TROUBLESHOOTING.md](./docs/ru/TROUBLESHOOTING.md) |

## Repository Hygiene

This public repository intentionally contains no production `.env`, no live server IPs, no private keys, no client subscription links, no database dumps, and no internal handoff notes. Generated credentials and runtime files must stay on the target server only.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

The project is a Node.js monorepo with `apps/api` and `apps/web`.

## Русский

### Быстрый Старт

Требования:

- чистый Debian 12 или Ubuntu 24.04 VPS;
- публичный IPv4;
- root или sudo доступ;
- открытый `443/tcp` для VPN;
- открытый `8443/tcp` для панели по IP или `80/tcp` + `443/tcp` для панели по домену.

Установка:

```bash
sudo git clone https://github.com/<owner>/xray-vpn-control-plane.git /opt/xray-vpn-control-plane
cd /opt/xray-vpn-control-plane
sudo bash install.sh
```

В обычном сценарии installer попросит только IP или домен сервера. Всё остальное создаётся автоматически: `.env`, секреты, REALITY/WireGuard keys, Docker Compose deployment и стартовый admin login block.

### Режимы

| Режим | Панель | VPN | Примечание |
| --- | --- | --- | --- |
| Только IP | `https://IP:8443` | `IP:443` | Внутренний TLS Caddy, браузер покажет предупреждение. |
| Домен | `https://DOMAIN` | `DOMAIN_OR_IP:443` | Let's Encrypt для панели, Xray остаётся на `443/tcp` через SNI routing. |

### Безопасность

- Не коммить реальные `.env`.
- Не коммить REALITY/WireGuard private keys.
- Не публикуй client links и subscription URLs.
- Считай subscription URL полноценным credential.
- Для публичной панели включай `TOTP 2FA` и ограничивай доступ firewall allowlist, если это возможно.

## License

MIT. See [LICENSE](./LICENSE).
