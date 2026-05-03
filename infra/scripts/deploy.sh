#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
PANEL_TLS_MODE_VALUE=""
WIREGUARD_ENABLED_VALUE=""

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

get_env_var() {
  local key="$1"
  grep "^${key}=" "${ENV_FILE}" | cut -d'=' -f2- || true
}

normalize_legacy_env_paths() {
  local current_backup_dir
  local current_host_backup_dir
  local desired_host_backup_dir

  current_backup_dir="$(grep '^BACKUP_DIR=' "${ENV_FILE}" | cut -d'=' -f2- || true)"
  current_host_backup_dir="$(grep '^BACKUP_HOST_DIR=' "${ENV_FILE}" | cut -d'=' -f2- || true)"
  desired_host_backup_dir="${ROOT_DIR}/infra/backup/output"

  case "${current_backup_dir}" in
    "${ROOT_DIR}/infra/backup/output"|"/opt/server-vpn/infra/backup/output")
      sed -i 's#^BACKUP_DIR=.*#BACKUP_DIR=/var/backups/server-vpn#' "${ENV_FILE}"
      echo "Normalized BACKUP_DIR to container path /var/backups/server-vpn"
      ;;
  esac

  case "${current_host_backup_dir}" in
    ""|"/var/backups/server-vpn"|"/absolute/path/to/project/infra/backup/output")
      if grep -q '^BACKUP_HOST_DIR=' "${ENV_FILE}"; then
        sed -i "s#^BACKUP_HOST_DIR=.*#BACKUP_HOST_DIR=${desired_host_backup_dir}#" "${ENV_FILE}"
      else
        printf '\nBACKUP_HOST_DIR=%s\n' "${desired_host_backup_dir}" >> "${ENV_FILE}"
      fi
      echo "Normalized BACKUP_HOST_DIR to ${desired_host_backup_dir}"
      ;;
  esac
}

prepare_runtime_dirs() {
  local log_dir="${ROOT_DIR}/infra/runtime/logs"

  mkdir -p "${ROOT_DIR}/infra/xray/generated"
  mkdir -p "${ROOT_DIR}/infra/backup/output"
  mkdir -p "${ROOT_DIR}/infra/wireguard/generated"
  mkdir -p "${ROOT_DIR}/infra/wireguard/runtime"
  mkdir -p "${log_dir}"

  touch "${log_dir}/api.log"
  touch "${log_dir}/xray-access.log"
  touch "${log_dir}/xray-error.log"
  touch "${log_dir}/caddy-access.log"
  touch "${log_dir}/wireguard.log"
  touch "${ROOT_DIR}/infra/wireguard/runtime/wg-show.dump"

  chmod 0644 "${log_dir}/api.log" "${log_dir}/caddy-access.log" "${log_dir}/wireguard.log"
  chmod 0666 "${log_dir}/xray-access.log" "${log_dir}/xray-error.log"
}

compose_files() {
  printf '%s\n' -f "${ROOT_DIR}/docker-compose.yml"

  case "${PANEL_TLS_MODE_VALUE}" in
    domain)
      printf '%s\n' -f "${ROOT_DIR}/docker-compose.domain.yml"
      ;;
    ip)
      printf '%s\n' -f "${ROOT_DIR}/docker-compose.ip.yml"
      ;;
    *)
      echo "Unsupported PANEL_TLS_MODE=${PANEL_TLS_MODE_VALUE}. Use ip or domain." >&2
      exit 1
      ;;
  esac
}

normalize_legacy_env_paths
prepare_runtime_dirs
bash "${ROOT_DIR}/infra/scripts/render-xray-config.sh"
bash "${ROOT_DIR}/infra/scripts/ensure-ssh-access.sh"

PANEL_TLS_MODE_VALUE="$(grep '^PANEL_TLS_MODE=' "${ENV_FILE}" | cut -d'=' -f2- || true)"
PANEL_TLS_MODE_VALUE="${PANEL_TLS_MODE_VALUE:-ip}"
WIREGUARD_ENABLED_VALUE="$(get_env_var WIREGUARD_ENABLED)"
WIREGUARD_ENABLED_VALUE="${WIREGUARD_ENABLED_VALUE:-false}"
mapfile -t compose_args < <(compose_files)

if [[ "${WIREGUARD_ENABLED_VALUE}" == "true" ]]; then
  docker compose "${compose_args[@]}" build api caddy wireguard
else
  docker compose "${compose_args[@]}" build api caddy
fi
docker compose "${compose_args[@]}" up -d postgres
docker compose "${compose_args[@]}" run --rm api npm run prisma:deploy
docker compose "${compose_args[@]}" run --rm api npm run prisma:seed
docker compose "${compose_args[@]}" up -d --remove-orphans api xray caddy

if [[ "${WIREGUARD_ENABLED_VALUE}" == "true" ]]; then
  docker compose "${compose_args[@]}" up -d --remove-orphans wireguard
else
  docker compose "${compose_args[@]}" rm -sf wireguard >/dev/null 2>&1 || true
fi

if [[ "${PANEL_TLS_MODE_VALUE}" == "domain" ]]; then
  docker compose "${compose_args[@]}" pull haproxy
  docker compose "${compose_args[@]}" up -d --remove-orphans haproxy
else
  docker compose "${compose_args[@]}" rm -sf haproxy >/dev/null 2>&1 || true
fi

echo "Deployment finished. Verify /healthz, /readyz, and panel reachability."
