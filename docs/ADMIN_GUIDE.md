# Admin Guide

## Daily Operations

- Use the `Clients` page for the full lifecycle: create, extend, disable, reset traffic, delete, export, and import.
- Use the `Dashboard` and `Server Status` pages to verify host load, runtime sync timestamps, and service health before and after changes.
- Use the `Logs` page for quick tail access to API, Xray, and Caddy logs without shell access.

## Roles

- `SUPER_ADMIN` can create and remove other admin/operator accounts.
- `OPERATOR` can manage clients and day-to-day operations, but cannot manage super-admin accounts.

## Authentication

- Enable `TOTP 2FA` for accounts with persistent access.
- Treat the panel basic auth and the in-app admin login as separate credentials.

## Backups

- Create backups from the `Backups` page before risky changes, migrations, or large imports.
- Automatic local backups run every 5 days and archives older than 14 days are pruned automatically.
- Download important archives to external storage; retention cleanup only protects local disk usage, not long-term disaster recovery.
- Restores remain a host-side operator action via `./infra/scripts/restore.sh --yes-restore /absolute/path/to/archive.tar.gz`.

## Import / Export

- Export creates a JSON bundle with client settings and aggregate traffic totals.
- Import defaults to safe merge mode.
- Enable overwrite only when you intentionally want to update existing clients matched by UUID or `emailTag`.
