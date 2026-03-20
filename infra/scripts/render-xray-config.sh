#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
OUTPUT_DIR="${ROOT_DIR}/infra/xray/generated"
OUTPUT_FILE="${OUTPUT_DIR}/config.json"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example to .env first." >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

required_vars=(
  XRAY_VLESS_LISTEN
  XRAY_VLESS_PORT
  XRAY_INBOUND_TAG
  XRAY_REALITY_DEST
  XRAY_REALITY_SERVER_NAMES
  XRAY_REALITY_PRIVATE_KEY
  XRAY_SHORT_IDS
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Environment variable ${var_name} is required." >&2
    exit 1
  fi
done

mkdir -p "${OUTPUT_DIR}"

server_names_json="$(printf '%s' "${XRAY_REALITY_SERVER_NAMES}" | awk -F',' '{
  printf "[";
  for (i = 1; i <= NF; i++) {
    gsub(/^ +| +$/, "", $i);
    printf "\"%s\"", $i;
    if (i < NF) {
      printf ",";
    }
  }
  printf "]";
}')"

short_ids_json="$(printf '%s' "${XRAY_SHORT_IDS}" | awk -F',' '{
  printf "[";
  for (i = 1; i <= NF; i++) {
    gsub(/^ +| +$/, "", $i);
    printf "\"%s\"", $i;
    if (i < NF) {
      printf ",";
    }
  }
  printf "]";
}')"

cat > "${OUTPUT_FILE}" <<EOF
{
  "log": {
    "loglevel": "warning"
  },
  "api": {
    "tag": "api",
    "services": ["HandlerService", "LoggerService", "StatsService"]
  },
  "stats": {},
  "policy": {
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true
    }
  },
  "inbounds": [
    {
      "listen": "${XRAY_VLESS_LISTEN}",
      "port": ${XRAY_VLESS_PORT},
      "protocol": "vless",
      "tag": "${XRAY_INBOUND_TAG}",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "dest": "${XRAY_REALITY_DEST}",
          "serverNames": ${server_names_json},
          "privateKey": "${XRAY_REALITY_PRIVATE_KEY}",
          "shortIds": ${short_ids_json}
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    },
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "tag": "api-inbound",
      "settings": {
        "address": "127.0.0.1"
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "blocked"
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "inboundTag": ["api-inbound"],
        "outboundTag": "api"
      }
    ]
  }
}
EOF

echo "Rendered ${OUTPUT_FILE}"

