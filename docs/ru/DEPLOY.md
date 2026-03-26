# Развёртывание

## Целевая Схема

Проект рассчитан на один VPS с `Docker Compose`.

Рекомендуемый baseline:

- Debian 12 или Ubuntu 24.04 LTS
- публичный IPv4
- root или sudo доступ
- открытые `443/tcp` и `8443/tcp`

## Сетевые Порты

- `443/tcp` -> `Xray-core`
- `8443/tcp` -> web panel через `Caddy`
- SSH остаётся на выбранном оператором порту

## Быстрое Развёртывание На Чистом VPS

1. Клонируй репозиторий.
2. Скопируй `.env.example` в `.env`.
3. Заполни секреты, пароли и адрес панели.
4. Сгенерируй REALITY ключи командой `xray x25519`.
5. При необходимости запусти `infra/scripts/bootstrap-server.sh`.
6. Выполни `docker compose up -d --build`.

## Что Важно Настроить Перед Первым Стартом

- `PANEL_HOST`, `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL`
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOTP_ENCRYPTION_SECRET`
- `INITIAL_ADMIN_*`
- `XRAY_REALITY_PRIVATE_KEY`, `XRAY_REALITY_PUBLIC_KEY`, `XRAY_SHORT_IDS`

## TLS И Домен

- VPN transport не требует отдельного panel-domain.
- Панель может стартовать на IP с `PANEL_TLS_MODE=internal`.
- Для публично доверенного HTTPS-сертификата панели нужен домен.
- Поскольку `443` занят под `Xray`, панель в текущем профиле работает на `8443`.

## Проверка После Деплоя

- `docker compose ps`
- `curl -k https://YOUR_HOST:8443/healthz`
- `curl -k https://YOUR_HOST:8443/readyz`
- первый вход в панель и создание тестового клиента

## Backups

- локальные backup snapshots создаются автоматически каждые 5 дней
- архивы старше 14 дней удаляются автоматически
- restore пока выполняется вручную на хосте:

```bash
./infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz
./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz
```
