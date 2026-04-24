# Troubleshooting

## Panel Shows a Certificate Warning

In `PANEL_TLS_MODE=ip`, the panel is served on `8443` with Caddy's internal certificate. Browsers will show a warning.

In `PANEL_TLS_MODE=domain`, the panel is served on `https://DOMAIN` with Let's Encrypt through HAProxy SNI routing. If certificate issuance fails, verify that the domain resolves to the VPS and that `80/tcp` and `443/tcp` are open.

## Browser Still Shows the Old UI After a Deploy

Do a full reload or open the panel in a new tab to clear cached assets after a frontend update.

## Admin Login Fails

- verify the password
- verify whether `TOTP 2FA` is enabled for that account
- check API and Caddy logs
- confirm rate limiting has not temporarily blocked repeated attempts

## Client Cannot Connect

- verify that the client app supports `REALITY`
- verify that the client is not expired or blocked by policy
- verify the generated link still matches the current server settings
- in domain mode, old IP-based links still work through the HAProxy default route as long as the REALITY SNI was not changed

## Backup and Restore

- always run restore with `--dry-run` first
- use an absolute archive path
- verify `healthz`, `readyz`, and live Xray sync after a restore
