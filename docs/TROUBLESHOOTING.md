# Troubleshooting

## Panel Shows a Certificate Warning

If the panel is exposed directly on an IP and `PANEL_TLS_MODE=internal`, browsers will show a certificate warning. A public CA-signed certificate requires a real DNS name.

## Browser Keeps Asking for Basic Auth

If you recently changed the panel edge auth configuration, do a full reload or reopen the panel in a new tab to clear a cached browser challenge.

## Admin Login Fails

- verify the password
- verify whether `TOTP 2FA` is enabled for that account
- check API and Caddy logs
- confirm rate limiting has not temporarily blocked repeated attempts

## Client Cannot Connect

- verify that the client app supports `REALITY`
- verify that the client is not expired or blocked by policy
- verify the generated link still matches the current server settings

## Backup and Restore

- always run restore with `--dry-run` first
- use an absolute archive path
- verify `healthz`, `readyz`, and live Xray sync after a restore
