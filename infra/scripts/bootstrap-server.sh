#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root or via sudo." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OS_ID="$(. /etc/os-release && printf '%s' "${ID}")"

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo "Docker is already installed."
    return
  fi

  case "${OS_ID}" in
    ubuntu|debian)
      apt-get update
      apt-get install -y ca-certificates curl git gnupg openssl ufw fail2ban
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/${OS_ID}/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    *)
      echo "Unsupported OS: ${OS_ID}. Install Docker manually." >&2
      exit 1
      ;;
  esac
}

configure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    echo "ufw is not installed; skipping firewall automation."
    return
  fi

  ufw allow OpenSSH
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 8443/tcp
  ufw --force enable
}

configure_fail2ban() {
  if [[ ! -d /etc/fail2ban ]]; then
    echo "Fail2ban is not installed; skipping."
    return
  fi

  install -m 0644 "${ROOT_DIR}/infra/fail2ban/jail.local" /etc/fail2ban/jail.local
  systemctl enable fail2ban
  systemctl restart fail2ban
}

prepare_runtime_dirs() {
  mkdir -p "${ROOT_DIR}/infra/xray/generated"
  mkdir -p "${ROOT_DIR}/infra/backup/output"
  mkdir -p "${ROOT_DIR}/infra/runtime/logs"
  touch "${ROOT_DIR}/infra/runtime/logs/api.log"
  touch "${ROOT_DIR}/infra/runtime/logs/xray-access.log"
  touch "${ROOT_DIR}/infra/runtime/logs/xray-error.log"
  touch "${ROOT_DIR}/infra/runtime/logs/caddy-access.log"
  chmod 0644 "${ROOT_DIR}/infra/runtime/logs/api.log" "${ROOT_DIR}/infra/runtime/logs/caddy-access.log"
  chmod 0666 "${ROOT_DIR}/infra/runtime/logs/xray-access.log" "${ROOT_DIR}/infra/runtime/logs/xray-error.log"
}

install_docker
configure_firewall
configure_fail2ban
prepare_runtime_dirs

echo "Bootstrap completed. Run install.sh for one-prompt setup, or fill .env manually and then run infra/scripts/deploy.sh."
