# Дорожная Карта

## Уже Сделано

- single-node архитектура на `api + postgres + xray + caddy`
- админская аутентификация с refresh sessions
- `TOTP 2FA`
- роли `SUPER_ADMIN` и `OPERATOR`
- CRUD клиентов, статусы, квоты, ограничения и live sync с Xray
- генерация `VLESS + REALITY` ссылок, subscription URLs и QR
- импорт/экспорт клиентов
- backup management и автоматические локальные backup snapshots
- web panel с переключением `RU/EN`, дашбордом, логами и статусом сервера
- guided UI restore flow с preflight, host-side командами и автоматическим safeguard backup

## Следующие Приоритеты

- более глубокая аналитика и usage history
- richer logs UX с фильтрацией и лучшей навигацией
- более простой public-domain onboarding для панели
- дополнительные transport profiles для совместимости

## Дальнейшее Развитие

- multi-node orchestration
- external storage / offsite backups
- alerting и webhooks
- более детализированная observability
