#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXCLUDE_FILE="${ROOT_DIR}/.public-export-ignore"

usage() {
  echo "Usage: $0 /absolute/path/to/public-repo-working-tree" >&2
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

target_dir="$1"

if [[ "${target_dir}" != /* ]]; then
  echo "Target path must be absolute: ${target_dir}" >&2
  exit 1
fi

if [[ ! -f "${EXCLUDE_FILE}" ]]; then
  echo "Missing exclude file: ${EXCLUDE_FILE}" >&2
  exit 1
fi

mkdir -p "${target_dir}"

rsync -a --delete --exclude-from="${EXCLUDE_FILE}" "${ROOT_DIR}/" "${target_dir}/"

find "${target_dir}" -name '.DS_Store' -delete

echo "Exported sanitized repository snapshot to ${target_dir}"
