#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

normalize_legacy_env_paths() {
  local current_backup_dir

  current_backup_dir="$(grep '^BACKUP_DIR=' "${ENV_FILE}" | cut -d'=' -f2- || true)"

  case "${current_backup_dir}" in
    "${ROOT_DIR}/infra/backup/output"|"/opt/server-vpn/infra/backup/output")
      sed -i 's#^BACKUP_DIR=.*#BACKUP_DIR=/var/backups/server-vpn#' "${ENV_FILE}"
      echo "Normalized BACKUP_DIR to container path /var/backups/server-vpn"
      ;;
  esac
}

prepare_runtime_dirs() {
  local log_dir="${ROOT_DIR}/infra/runtime/logs"

  mkdir -p "${ROOT_DIR}/infra/xray/generated"
  mkdir -p "${ROOT_DIR}/infra/backup/output"
  mkdir -p "${log_dir}"

  touch "${log_dir}/api.log"
  touch "${log_dir}/xray-access.log"
  touch "${log_dir}/xray-error.log"
  touch "${log_dir}/caddy-access.log"

  chmod 0644 "${log_dir}/api.log" "${log_dir}/caddy-access.log"
  chmod 0666 "${log_dir}/xray-access.log" "${log_dir}/xray-error.log"
}

normalize_legacy_env_paths
prepare_runtime_dirs
bash "${ROOT_DIR}/infra/scripts/render-xray-config.sh"
bash "${ROOT_DIR}/infra/scripts/ensure-ssh-access.sh"

docker compose -f "${ROOT_DIR}/docker-compose.yml" build api caddy
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d postgres
docker compose -f "${ROOT_DIR}/docker-compose.yml" run --rm api npm run prisma:deploy
docker compose -f "${ROOT_DIR}/docker-compose.yml" run --rm api npm run prisma:seed
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d api xray caddy

echo "Deployment finished. Verify /healthz, /readyz, and panel reachability."
