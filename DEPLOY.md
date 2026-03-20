# Deploy

## MVP Deployment Notes

The MVP is designed for a single VPS with Docker Compose.

### Expected Host

- Debian 12 or Ubuntu 24.04 LTS recommended
- Public IPv4 available
- Root or sudo access available
- Docker Engine installed or installable

### Network Layout

- `443/tcp` -> Xray VLESS REALITY
- `8443/tcp` -> admin panel via Caddy
- SSH remains on the operator-chosen port

### Before First Deploy

1. Copy `.env.example` to `.env`.
2. Fill all placeholders.
3. Generate REALITY key pair with `xray x25519`.
4. Review `infra/scripts/bootstrap-server.sh`.
5. Restrict panel access in firewall rules.

### Important Constraint

The panel can run with internal or operator-supplied TLS immediately, but a publicly trusted HTTPS certificate for the panel requires a real DNS name.

### Deploy Command

```bash
docker compose up -d --build
```

### Next Steps

- Harden host firewall.
- Install Fail2ban.
- Configure automated backups.
- Add a domain later if you want a public CA-signed panel certificate.

