#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
XRAY_RUNTIME_CONFIG_PATH="${ROOT_DIR}/infra/xray/generated/config.json"

usage() {
  echo "Usage: $0 [--dry-run] --yes-restore /absolute/path/to/archive.tar.gz" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

compose() {
  docker compose -f "${ROOT_DIR}/docker-compose.yml" "$@"
}

DRY_RUN=false
CONFIRMED=false
ARCHIVE_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes-restore)
      CONFIRMED=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -n "${ARCHIVE_PATH}" ]]; then
        echo "Archive path was provided more than once." >&2
        usage
        exit 1
      fi

      ARCHIVE_PATH="$1"
      shift
      ;;
  esac
done

if [[ "${CONFIRMED}" != "true" || -z "${ARCHIVE_PATH}" ]]; then
  usage
  exit 1
fi

if [[ "${ARCHIVE_PATH}" != /* ]]; then
  echo "Archive path must be absolute: ${ARCHIVE_PATH}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "Archive not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

require_command docker
require_command tar
require_command grep
require_command sed
require_command mktemp

set -a
source "${ENV_FILE}"
set +a

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

payload_dir="${tmp_dir}/payload"
mkdir -p "${payload_dir}"
tar -xzf "${ARCHIVE_PATH}" -C "${payload_dir}"

manifest_path="${payload_dir}/manifest.json"
postgres_dump_path="${payload_dir}/postgres.sql"
xray_config_path="${payload_dir}/xray-config.json"

if [[ ! -f "${manifest_path}" ]]; then
  echo "Archive is missing manifest.json: ${ARCHIVE_PATH}" >&2
  exit 1
fi

if [[ ! -f "${postgres_dump_path}" ]]; then
  echo "Archive is missing postgres.sql: ${ARCHIVE_PATH}" >&2
  exit 1
fi

backup_id="$(grep -Eo '"backupId"[[:space:]]*:[[:space:]]*"[^"]+"' "${manifest_path}" | sed -E 's/.*"([^"]+)"/\1/' | head -n1 || true)"
schema_version="$(grep -Eo '"schemaVersion"[[:space:]]*:[[:space:]]*[0-9]+' "${manifest_path}" | sed -E 's/.*:[[:space:]]*([0-9]+)/\1/' | head -n1 || true)"

echo "Restore preflight"
echo "  archive: ${ARCHIVE_PATH}"
echo "  manifest: ${manifest_path}"
echo "  postgres dump: ${postgres_dump_path}"

if [[ -f "${xray_config_path}" ]]; then
  echo "  xray config: ${xray_config_path}"
else
  echo "  xray config: not present in archive, current config.json will be preserved"
fi

if [[ -n "${backup_id}" ]]; then
  echo "  backupId: ${backup_id}"
fi

if [[ -n "${schema_version}" ]]; then
  echo "  schemaVersion: ${schema_version}"
fi

if [[ "${schema_version}" != "" && "${schema_version}" != "1" ]]; then
  echo "Unsupported manifest schemaVersion: ${schema_version}" >&2
  exit 1
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Dry-run completed. No files were changed."
  exit 0
fi

restore_note="Restored from host script at $(date -u +"%Y-%m-%dT%H:%M:%SZ")."

compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" < "${postgres_dump_path}"

if [[ -f "${xray_config_path}" ]]; then
  timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"

  if [[ -f "${XRAY_RUNTIME_CONFIG_PATH}" ]]; then
    cp "${XRAY_RUNTIME_CONFIG_PATH}" "${ROOT_DIR}/infra/xray/generated/config.pre-restore-${timestamp}.json"
  fi

  cp "${xray_config_path}" "${XRAY_RUNTIME_CONFIG_PATH}"
fi

if [[ -n "${backup_id}" ]]; then
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<SQL
UPDATE "BackupSnapshot"
SET "restoredAt" = NOW(),
    "status" = 'RESTORED',
    "notes" = CASE
      WHEN "notes" IS NULL OR "notes" = '' THEN '${restore_note}'
      ELSE "notes" || E'\n${restore_note}'
    END
WHERE "id" = '${backup_id}';
SQL
fi

compose restart api xray

echo "Restore completed from ${ARCHIVE_PATH}"
