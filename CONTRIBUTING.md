# Contributing

Thanks for helping improve Xray VPN Control Plane.

## Before You Open a PR

- Keep changes focused and easy to review.
- Run `npm run lint`, `npm run typecheck`, and `npm run test` when possible.
- Do not commit `.env`, live server IPs, private keys, subscription URLs, generated client configs, backup archives, or internal handoff notes.
- Use placeholders such as `YOUR_DOMAIN`, `YOUR_SERVER_IP`, and `https://github.com/<owner>/xray-vpn-control-plane.git` in docs.

## Development Setup

```bash
npm ci
npm run dev
```

The repository is a workspace monorepo:

- `apps/api` contains the NestJS API.
- `apps/web` contains the React panel.
- `infra` contains deployment, Xray, Caddy, HAProxy, backup, and WireGuard assets.

## Security Reports

Do not disclose vulnerabilities in public issues. Use private vulnerability reporting or contact the maintainer privately.

## Русский

Перед PR:

- Делай изменения небольшими и понятными.
- По возможности запускай `npm run lint`, `npm run typecheck`, `npm run test`.
- Не коммить `.env`, реальные IP серверов, private keys, subscription URLs, клиентские конфиги, backup archives и внутренние handoff-файлы.
- В документации используй placeholders: `YOUR_DOMAIN`, `YOUR_SERVER_IP`, `https://github.com/<owner>/xray-vpn-control-plane.git`.
