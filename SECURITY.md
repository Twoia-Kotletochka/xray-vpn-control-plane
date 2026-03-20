# Security Policy

## Scope

This repository manages VPN control-plane code, generated client credentials, and server deployment automation. Treat it as security-sensitive infrastructure.

## Rules

- Do not commit `.env` with real secrets.
- Do not commit REALITY private keys.
- Do not commit live subscription URLs or working client configs.
- Do not commit database dumps from production.
- Do not place access tokens inside Dockerfiles, Compose files, or scripts.

## Secret Storage

Supported approaches for local or production use:

- ignored `.env`
- ignored local secret files
- Docker secrets or orchestrator-managed secrets in a future deployment

## Hardening Baseline

- strong bcrypt password hashing
- short-lived access tokens
- hashed refresh sessions
- rate limiting and brute-force protection
- audit logs for privileged actions
- host firewall and Fail2ban
- least-privilege containers where practical

## Vulnerability Reporting

If this system is ever exposed to external users, report suspected vulnerabilities privately to the operator instead of opening a public issue with exploit details.

