# Политика Безопасности

## Область

Этот репозиторий управляет control plane для VPN, админским доступом, клиентскими подписками и автоматизацией развёртывания. Относись к нему как к security-sensitive инфраструктуре.

## Базовые Правила

- не коммить `.env` с реальными значениями
- не коммить REALITY private keys
- не коммить рабочие subscription URLs и клиентские конфиги
- не коммить production database dumps
- не хранить access tokens в Dockerfile, Compose-файлах или shell scripts

## Хранение Секретов

Поддерживаемые подходы:

- игнорируемый `.env`
- локальные файлы секретов вне git
- в будущем: Docker secrets или внешний secret manager

## Hardening Baseline

- bcrypt password hashing
- короткоживущие access tokens
- hashed refresh sessions
- rate limiting на auth endpoints
- audit logs для привилегированных действий
- optional `TOTP 2FA`
- host firewall и Fail2ban

## Ответственное Раскрытие

Если проект используется в реальной эксплуатации, уязвимости следует раскрывать приватно оператору, а не через публичный issue с деталями эксплуатации.
