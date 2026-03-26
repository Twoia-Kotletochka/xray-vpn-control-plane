#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

timestamp="$(date +%Y%m%d-%H%M%S)"
work_dir="${ROOT_DIR}/infra/backup/output/${timestamp}"
archive_path="${ROOT_DIR}/infra/backup/output/server-vpn-${timestamp}.tar.gz"

mkdir -p "${work_dir}"

docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${work_dir}/postgres.sql"

cp "${ROOT_DIR}/infra/xray/generated/config.json" "${work_dir}/xray-config.json"

tar -czf "${archive_path}" -C "${work_dir}" .
rm -rf "${work_dir}"

echo "Backup created: ${archive_path}"

