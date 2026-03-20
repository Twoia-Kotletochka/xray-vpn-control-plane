#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--yes-restore" || -z "${2:-}" ]]; then
  echo "Usage: $0 --yes-restore /absolute/path/to/archive.tar.gz" >&2
  exit 1
fi

ARCHIVE_PATH="$2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

tar -xzf "${ARCHIVE_PATH}" -C "${tmp_dir}"

cp "${tmp_dir}/xray-config.json" "${ROOT_DIR}/infra/xray/generated/config.json"
docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${tmp_dir}/postgres.sql"
docker compose -f "${ROOT_DIR}/docker-compose.yml" restart api xray

echo "Restore completed from ${ARCHIVE_PATH}"

