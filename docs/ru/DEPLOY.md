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

## Самый Быстрый Первый Запуск

Если нужен минимальный ручной ввод, используй guided installer:

```bash
sudo git clone https://github.com/Twoia-Kotletochka/server-vpn.git /opt/server-vpn
cd /opt/server-vpn
sudo bash install.sh
```

`install.sh` запускает host bootstrap, создаёт `.env` из `.env.example`, генерирует недостающие секреты и REALITY keys, а затем выполняет `infra/scripts/deploy.sh`.

## Ручное Развёртывание На Чистом VPS

```bash
sudo git clone https://github.com/Twoia-Kotletochka/server-vpn.git /opt/server-vpn
cd /opt/server-vpn
sudo bash infra/scripts/bootstrap-server.sh
cp .env.example .env
```

Перед редактированием `.env` сгенерируй значения:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # TOTP_ENCRYPTION_SECRET
openssl rand -hex 8    # XRAY_SHORT_IDS
docker run --rm ghcr.io/xtls/xray-core:26.2.6 x25519
```

Команда `x25519` выведет пару ключей для:

- `XRAY_REALITY_PRIVATE_KEY`
- `XRAY_REALITY_PUBLIC_KEY`

## Что Важно Настроить Перед Первым Стартом

- `PANEL_HOST`, `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL`
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOTP_ENCRYPTION_SECRET`
- `INITIAL_ADMIN_*`
- `XRAY_REALITY_PRIVATE_KEY`, `XRAY_REALITY_PUBLIC_KEY`, `XRAY_SHORT_IDS`

Примечания:

- Если домена пока нет, укажи публичный IP VPS в `PANEL_HOST`, `PANEL_PUBLIC_URL`, `XRAY_SUBSCRIPTION_BASE_URL` и `API_CORS_ORIGIN` с портом `:8443`.
- `INITIAL_ADMIN_*` создаёт первый аккаунт панели на этапе seed.
- `XRAY_SHORT_IDS` принимает один или несколько 16-символьных hex-идентификаторов через запятую.
- `BACKUP_HOST_DIR` на первом запуске можно оставить пустым; `deploy.sh` сам нормализует его в `<repo>/infra/backup/output`.

## TLS И Домен

- VPN transport не требует отдельного panel-domain.
- По умолчанию панель отдаётся на `8443` с внутренним сертификатом Caddy.
- Браузер будет показывать предупреждение, пока ты не доверишь этой CA или не поставишь собственную схему с публичным сертификатом.
- Поскольку `443` занят под `Xray`, панель в текущем профиле работает на `8443`.

## Первый Деплой

```bash
bash infra/scripts/deploy.sh
```

## Проверка После Деплоя

```bash
docker compose ps
curl -k https://YOUR_HOST:8443/healthz
curl -k https://YOUR_HOST:8443/readyz
```

После этого:

1. войди с `INITIAL_ADMIN_USERNAME` и `INITIAL_ADMIN_PASSWORD`
2. создай тестового клиента
3. проверь реальное подключение из поддерживаемого Xray-клиента

## Backups

- локальные backup snapshots создаются автоматически каждые 5 дней
- архивы старше 14 дней удаляются автоматически
- restore пока выполняется вручную на хосте:

```bash
./infra/scripts/restore.sh --dry-run --yes-restore /absolute/path/to/archive.tar.gz
./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz
```
