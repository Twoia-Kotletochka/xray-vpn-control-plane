#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing .env. Copy .env.example to .env first." >&2
  exit 1
fi

bash "${ROOT_DIR}/infra/scripts/render-xray-config.sh"

docker compose -f "${ROOT_DIR}/docker-compose.yml" build api caddy
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d postgres
docker compose -f "${ROOT_DIR}/docker-compose.yml" run --rm api npm run prisma:deploy
docker compose -f "${ROOT_DIR}/docker-compose.yml" run --rm api npm run prisma:seed
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d api xray caddy

echo "Deployment finished. Verify /healthz, /readyz, and panel reachability."
