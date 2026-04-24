# Архитектура

## Цели

- Надёжно работать на одном VPS без лишних движущихся частей.
- Сохранять быстрый и предсказуемый data plane на `Xray-core`.
- Делать админские операции безопасными, наблюдаемыми и повторяемыми.
- Оставить чистый путь для будущего расширения: дополнительные профили транспорта, richer analytics и более сложные topologies.

## Текущая Топология

### Runtime

- `xray`
  - публичная точка входа VPN на `443/tcp` в IP-only режиме или внутренний backend за HAProxy в domain режиме
  - профиль по умолчанию: `VLESS + REALITY + XTLS Vision`
  - внутренний gRPC API для stats и управления пользователями
- `api`
  - REST API на `NestJS`
  - источник истины для админов, клиентов, ролей, лимитов, аудита и политики бэкапов
- `postgres`
  - постоянное хранилище для Prisma-модели
- `caddy`
  - раздаёт собранный web UI
  - проксирует `/api/*` в backend
  - завершает TLS панели на `8443` в IP-only режиме или на домене через Let's Encrypt в domain режиме
- `haproxy`
  - включается только в domain режиме
  - принимает `80/tcp` и `443/tcp`
  - направляет SNI домена панели в `Caddy`, а остальной TLS-трафик на `443` в `Xray`
- host-level сервисы
  - firewall
  - Fail2ban
  - Docker Engine / Compose
  - optional timers для обслуживания и внешнего backup shipping

## Почему Выбран Такой Стек

- `NestJS` даёт чёткие модульные границы, guards, DTO validation и удобную security model.
- `Prisma + PostgreSQL` упрощают долговременную поддержку схемы, миграции и type-safe query code.
- `React + Vite` подходят для операционной панели лучше, чем более тяжёлый SSR-стек.
- `Caddy` упрощает переход от internal/self-managed TLS к публичному сертификату, когда появляется домен.

## Модель Интеграции С Xray

`PostgreSQL` и backend являются control plane. `Xray` остаётся data plane.

Базовый поток:

1. Оператор меняет клиента в панели.
2. API валидирует изменения и сохраняет их в БД.
3. API синхронизирует live-состояние в Xray через внутренний API.
4. API пишет audit event.
5. Фоновые задачи снимают usage/runtime snapshots и обслуживают backup policy.

## Модель Доступа

- `SUPER_ADMIN`
  - полный доступ
  - может создавать и удалять другие админ-аккаунты
- `OPERATOR`
  - может работать с клиентами, логами, статусом, импортом/экспортом и бэкапами
  - не может управлять super-admin аккаунтами

## Надёжность И Безопасность

- restart policies на runtime-сервисах
- healthchecks для `api`, `postgres`, `xray`, `caddy`
- bcrypt password hashing
- access token + hashed refresh sessions
- optional `TOTP 2FA`
- audit trail для привилегированных действий
- scheduled local backups каждые 5 дней с retention 14 дней
- restore пока остаётся host-side операцией через shell script

## Известные Ограничения

- analytics и logs UX пока на MVP-уровне
- без домена панель остаётся на internal TLS `:8443`
- с доменом public TLS выпускается автоматически через Caddy в domain режиме
- основной профиль транспорта сейчас один: `VLESS + REALITY`
