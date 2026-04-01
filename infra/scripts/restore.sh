#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
XRAY_RUNTIME_CONFIG_PATH="${ROOT_DIR}/infra/xray/generated/config.json"
BACKUP_OUTPUT_DIR="${ROOT_DIR}/infra/backup/output"

usage() {
  echo "Usage: $0 [--dry-run] [--skip-safeguard-backup] --yes-restore /absolute/path/to/archive.tar.gz" >&2
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
SKIP_SAFEGUARD_BACKUP=false
ARCHIVE_PATH=""
SAFEGUARD_BACKUP_ID=""
SAFEGUARD_FILE_NAME=""
SAFEGUARD_CHECKSUM=""
SAFEGUARD_FILE_SIZE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-safeguard-backup)
      SKIP_SAFEGUARD_BACKUP=true
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
require_command awk
require_command sha256sum
require_command stat

set -a
source "${ENV_FILE}"
set +a

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

payload_dir="${tmp_dir}/payload"
mkdir -p "${payload_dir}"
tar -xzf "${ARCHIVE_PATH}" -C "${payload_dir}"

create_safeguard_snapshot() {
  local timestamp
  local created_at
  local safeguard_stage_dir
  local safeguard_manifest_path
  local safeguard_postgres_dump_path
  local safeguard_xray_config_path
  local safeguard_archive_path
  local manifest_xray_config

  timestamp="$(date -u +"%Y%m%d-%H%M%SZ")"
  created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  safeguard_stage_dir="${tmp_dir}/safeguard-${timestamp}"
  safeguard_manifest_path="${safeguard_stage_dir}/manifest.json"
  safeguard_postgres_dump_path="${safeguard_stage_dir}/postgres.sql"
  safeguard_xray_config_path="${safeguard_stage_dir}/xray-config.json"
  safeguard_archive_path="${BACKUP_OUTPUT_DIR}/server-vpn-pre-restore-${timestamp}.tar.gz"

  mkdir -p "${BACKUP_OUTPUT_DIR}"
  mkdir -p "${safeguard_stage_dir}"

  compose exec -T postgres \
    pg_dump \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
      -U "${POSTGRES_USER}" \
      "${POSTGRES_DB}" > "${safeguard_postgres_dump_path}"

  manifest_xray_config="null"
  if [[ -f "${XRAY_RUNTIME_CONFIG_PATH}" ]]; then
    cp "${XRAY_RUNTIME_CONFIG_PATH}" "${safeguard_xray_config_path}"
    manifest_xray_config='"xray-config.json"'
  fi

  SAFEGUARD_BACKUP_ID="pre-restore-${timestamp}"
  SAFEGUARD_FILE_NAME="$(basename "${safeguard_archive_path}")"

  cat > "${safeguard_manifest_path}" <<EOF
{
  "backupId": "${SAFEGUARD_BACKUP_ID}",
  "createdAt": "${created_at}",
  "schemaVersion": 1,
  "services": {
    "postgresDump": "postgres.sql",
    "xrayConfig": ${manifest_xray_config}
  }
}
EOF

  tar -czf "${safeguard_archive_path}" -C "${safeguard_stage_dir}" .

  SAFEGUARD_CHECKSUM="$(sha256sum "${safeguard_archive_path}" | awk '{print $1}')"
  SAFEGUARD_FILE_SIZE="$(stat -c %s "${safeguard_archive_path}")"

  echo "Safeguard backup created: ${safeguard_archive_path}"
}

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

if [[ "${SKIP_SAFEGUARD_BACKUP}" != "true" ]]; then
  create_safeguard_snapshot
else
  echo "Skipping safeguard backup by explicit operator override."
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

if [[ -n "${SAFEGUARD_BACKUP_ID}" ]]; then
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<SQL
INSERT INTO "BackupSnapshot" ("id", "fileName", "checksumSha256", "fileSizeBytes", "status", "notes")
VALUES (
  '${SAFEGUARD_BACKUP_ID}',
  '${SAFEGUARD_FILE_NAME}',
  '${SAFEGUARD_CHECKSUM}',
  ${SAFEGUARD_FILE_SIZE},
  'READY',
  'Automatic safeguard backup created immediately before restore.'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AuditLog" ("action", "entityType", "entityId", "summary", "metadata")
VALUES (
  'BACKUP_CREATED',
  'backup',
  '${SAFEGUARD_BACKUP_ID}',
  'Automatic safeguard backup created immediately before restore.',
  '{"trigger":"restore-safeguard"}'::jsonb
);
SQL
fi

compose restart api xray

echo "Restore completed from ${ARCHIVE_PATH}"
