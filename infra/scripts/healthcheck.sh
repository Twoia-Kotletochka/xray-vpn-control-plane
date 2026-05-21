#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

docker compose -f "${ROOT_DIR}/docker-compose.yml" ps
curl -fsS "http://127.0.0.1:3000/healthz"
echo
curl -fsS "http://127.0.0.1:3000/readyz"
echo

