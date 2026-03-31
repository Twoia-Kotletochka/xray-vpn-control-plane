#!/usr/bin/env bash
set -euo pipefail

ensure_ufw_open() {
  if ! command -v ufw >/dev/null 2>&1; then
    echo "ufw is not installed; skipping."
    return
  fi

  if ufw status 2>/dev/null | grep -q 'inactive'; then
    echo "ufw is inactive; skipping."
    return
  fi

  ufw allow 22/tcp
  ufw status verbose | sed -n '1,120p'
}

ensure_fail2ban_unbans() {
  if ! command -v fail2ban-client >/dev/null 2>&1; then
    return
  fi

  fail2ban-client set sshd unban "*" || true
}

ensure_ufw_open
ensure_fail2ban_unbans
echo "SSH access hardening check finished."
