# Handoff Addendum: WireGuard

Date: 2026-05-03

This addendum captures the local WireGuard work that was prepared after the main May handoff.

## What Was Added

- A second client transport: `WireGuard`, alongside the existing `VLESS + REALITY` path.
- Per-client transport switches so an operator can issue:
  - only `VLESS`
  - only `WireGuard`
  - both at the same time
- Dual endpoint variants for delivery:
  - preferred domain-based config
  - direct IP fallback config
- Background legacy-client backfill so already existing clients can receive new WireGuard configs without breaking their current VLESS access.

## Data Model Changes

- `Client.vlessEnabled`
- `Client.wireguardEnabled`
- new `WireguardPeer` table for:
  - assigned tunnel IPv4
  - encrypted private key
  - public key
  - optional preshared key
  - observed transfer counters
  - handshake timestamps

Migration:

- [20260503_add_wireguard_support](D:/server-VPN/apps/api/prisma/migrations/20260503_add_wireguard_support/migration.sql)

## Backend Scope

- New module:
  - [wireguard.service.ts](D:/server-VPN/apps/api/src/modules/wireguard/wireguard.service.ts)
- Generates and persists one peer per enabled client.
- Renders server config for the runtime container.
- Builds client bundles with domain/IP variants and QR-ready `.conf` payloads.
- Parses runtime dump telemetry and stores handshake / transfer observations.
- Exposes WireGuard state into system status and client serialization.

## Frontend Scope

- Client create/edit flow now includes transport toggles.
- Client card shows WireGuard tunnel IP and handshake metadata when available.
- Config delivery UI can switch:
  - transport
  - address mode
- Operators can copy/download the active config variant directly from the client view.

## Infra Scope

- New Compose service: `wireguard`
- Host networking with `NET_ADMIN`
- Runtime files under:
  - [infra/wireguard](D:/server-VPN/infra/wireguard)
- Build recipe:
  - [wireguard.Dockerfile](D:/server-VPN/infra/docker/wireguard.Dockerfile)
- Host bootstrap now installs WireGuard tooling, enables forwarding, and opens `51820/udp`.

## Safety Notes

- This change is additive. It does not remove or replace the existing Xray/VLESS runtime.
- Existing clients should keep working over VLESS while WireGuard peers/configs are backfilled.
- No live secrets, server private keys, or generated client configs are committed to git.

## Validation Status

Local validation already passed for this change set:

- `npm run test`
- `npm run typecheck`
- `npm run build`

Known repo state:

- repo-wide `npm run lint` still reports pre-existing Biome formatting debt outside this feature slice
- the WireGuard feature itself is ready to continue through private push, VPS rollout, and then public mirror sync
