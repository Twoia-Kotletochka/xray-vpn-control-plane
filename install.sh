#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "install.sh is intended for a Linux VPS." >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/.env.example"
INSTALL_SUMMARY_FILE="/root/.server-vpn-install.txt"

HOST_OVERRIDE=""
ADMIN_USERNAME_OVERRIDE=""
ADMIN_EMAIL_OVERRIDE=""
ADMIN_PASSWORD_OVERRIDE=""
SKIP_BOOTSTRAP=false
NON_INTERACTIVE=false

usage() {
  cat <<'EOF'
Usage: sudo bash install.sh [options]

Options:
  --host <domain-or-ip>           Panel host or public IP for panel URLs
  --admin-username <username>     Optional override for the initial admin username
  --admin-email <email>           Optional override for the initial admin email
  --admin-password <password>     Optional override for the initial admin password
  --skip-bootstrap                Skip infra/scripts/bootstrap-server.sh
  --non-interactive               Do not prompt; fail if required input is missing
  -h, --help                      Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST_OVERRIDE="${2:-}"
      shift 2
      ;;
    --admin-username)
      ADMIN_USERNAME_OVERRIDE="${2:-}"
      shift 2
      ;;
    --admin-email)
      ADMIN_EMAIL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD_OVERRIDE="${2:-}"
      shift 2
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=true
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -t 0 ]]; then
  NON_INTERACTIVE=true
fi

log() {
  printf '%s\n' "$*"
}

error() {
  printf '%s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

get_env_var() {
  local key="$1"
  local line

  line="$(grep -E "^${key}=" "${ENV_FILE}" | head -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return 0
  fi

  printf '%s' "${line#*=}"
}

set_env_var() {
  local key="$1"
  local value="$2"
  local tmp_file

  tmp_file="$(mktemp)"

  awk -v key="${key}" -v value="${value}" '
    BEGIN {
      updated = 0
    }
    index($0, key "=") == 1 {
      print key "=" value
      updated = 1
      next
    }
    {
      print
    }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "${ENV_FILE}" > "${tmp_file}"

  mv "${tmp_file}" "${ENV_FILE}"
}

is_blank_or_placeholder() {
  local value="$1"

  case "${value}" in
    ""|"change-me"|"replace-me"|"replace-with-"*|"panel.example.com"|"admin@example.com"|"https://panel.example.com"|"https://panel.example.com:8443"|"/absolute/path/to/project/infra/backup/output")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_default_database_url() {
  local value="$1"
  [[ -z "${value}" || "${value}" == *"change-me@postgres:5432/server_vpn?schema=public"* ]]
}

normalize_host() {
  local value="$1"

  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"

  if [[ "${value}" == *:* && "${value}" != \[*\] ]]; then
    value="${value%%:*}"
  fi

  printf '%s' "${value}"
}

is_ipv4_address() {
  local value="$1"

  [[ "${value}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

detect_public_host() {
  if ! command_exists curl; then
    return 1
  fi

  curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || return 1
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local entered_value

  if [[ "${NON_INTERACTIVE}" == true ]]; then
    printf '%s' "${default_value}"
    return 0
  fi

  if [[ -n "${default_value}" ]]; then
    read -r -p "${label} [${default_value}]: " entered_value
    printf '%s' "${entered_value:-${default_value}}"
  else
    read -r -p "${label}: " entered_value
    printf '%s' "${entered_value}"
  fi
}

generate_hex() {
  local bytes="$1"

  command_exists openssl || error "openssl is required. Run bootstrap first or install openssl."
  openssl rand -hex "${bytes}"
}

generate_admin_password() {
  command_exists openssl || error "openssl is required. Run bootstrap first or install openssl."
  openssl rand -base64 24 | tr -d '\n' | tr '/+=' 'XYZ' | cut -c1-20
}

write_install_summary() {
  local summary_password="$1"

  umask 077

  cat > "${INSTALL_SUMMARY_FILE}" <<EOF
Installed at: $(date -Is)
Project path: ${ROOT_DIR}
Panel URL: ${panel_url}
Initial admin username: ${initial_admin_username}
Initial admin email: ${initial_admin_email}
Initial admin password: ${summary_password}
EOF
}

print_install_summary() {
  local summary_password="$1"
  local tls_note

  if [[ "${panel_tls_mode}" == "domain" ]]; then
    tls_note="Caddy will request and renew a public Let's Encrypt certificate for ${panel_host}."
  else
    tls_note="IP-only mode uses Caddy internal TLS on :8443, so the browser may show a certificate warning."
  fi

  cat <<EOF

============================================================
INSTALL COMPLETE
============================================================

Panel URL:
  ${panel_url}

Admin access:
  Username: ${initial_admin_username}
  Email:    ${initial_admin_email}
  Password: ${summary_password}

Saved locally:
  ${INSTALL_SUMMARY_FILE}

Copy/paste login block:
------------------------------------------------------------
URL: ${panel_url}
USERNAME: ${initial_admin_username}
PASSWORD: ${summary_password}
------------------------------------------------------------

Next steps:
  1. Open ${panel_url}
  2. Log in with the credentials above
  3. Create one test client and verify a real connection

Note:
  ${tls_note}

============================================================
EOF
}

generate_reality_keys() {
  local xray_image="$1"
  local output
  local private_key
  local public_key

  command_exists docker || error "docker is required. Run bootstrap first or install Docker."

  output="$(docker run --rm "${xray_image}" x25519)"
  private_key="$(printf '%s\n' "${output}" | awk -F': ' '/Private key/ { print $2 }')"
  public_key="$(printf '%s\n' "${output}" | awk -F': ' '/Public key/ { print $2 }')"

  if [[ -z "${private_key}" || -z "${public_key}" ]]; then
    error "Could not parse REALITY keypair from docker x25519 output."
  fi

  printf '%s\n%s\n' "${private_key}" "${public_key}"
}

if [[ ! -f "${ENV_EXAMPLE_FILE}" ]]; then
  error "Missing ${ENV_EXAMPLE_FILE}."
fi

if [[ "${SKIP_BOOTSTRAP}" == false ]]; then
  log "Running bootstrap-server.sh"
  bash "${ROOT_DIR}/infra/scripts/bootstrap-server.sh"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
  log "Created ${ENV_FILE} from .env.example"
fi

if [[ ! -f "${ENV_FILE}.install.bak" ]]; then
  cp "${ENV_FILE}" "${ENV_FILE}.install.bak"
fi

current_host="$(get_env_var PANEL_HOST)"
if [[ -n "${HOST_OVERRIDE}" ]]; then
  panel_host="$(normalize_host "${HOST_OVERRIDE}")"
elif is_blank_or_placeholder "${current_host}"; then
  detected_host="$(detect_public_host || true)"
  panel_host="$(normalize_host "$(prompt_value "Server public IP or panel host" "${detected_host}")")"
else
  panel_host="$(normalize_host "${current_host}")"
fi

[[ -n "${panel_host}" ]] || error "PANEL_HOST is required. Pass --host or edit ${ENV_FILE}."

if is_ipv4_address "${panel_host}"; then
  panel_tls_mode="ip"
  panel_url="https://${panel_host}:8443"
else
  panel_tls_mode="domain"
  panel_url="https://${panel_host}"
fi

set_env_var PANEL_TLS_MODE "${panel_tls_mode}"
set_env_var PANEL_HOST "${panel_host}"
set_env_var PANEL_HTTPS_PORT "8443"
set_env_var XRAY_PUBLIC_HOST "${panel_host}"

if is_blank_or_placeholder "$(get_env_var PANEL_PUBLIC_URL)"; then
  set_env_var PANEL_PUBLIC_URL "${panel_url}"
fi

if is_blank_or_placeholder "$(get_env_var XRAY_SUBSCRIPTION_BASE_URL)"; then
  set_env_var XRAY_SUBSCRIPTION_BASE_URL "${panel_url}"
fi

if is_blank_or_placeholder "$(get_env_var API_CORS_ORIGIN)"; then
  set_env_var API_CORS_ORIGIN "${panel_url}"
fi

postgres_password="$(get_env_var POSTGRES_PASSWORD)"
if is_blank_or_placeholder "${postgres_password}"; then
  postgres_password="$(generate_hex 18)"
  set_env_var POSTGRES_PASSWORD "${postgres_password}"
fi

postgres_user="$(get_env_var POSTGRES_USER)"
postgres_db="$(get_env_var POSTGRES_DB)"
postgres_user="${postgres_user:-server_vpn}"
postgres_db="${postgres_db:-server_vpn}"

default_database_url="postgresql://${postgres_user}:${postgres_password}@postgres:5432/${postgres_db}?schema=public"

if is_default_database_url "$(get_env_var DATABASE_URL)"; then
  set_env_var DATABASE_URL "${default_database_url}"
fi

if is_default_database_url "$(get_env_var DATABASE_DIRECT_URL)"; then
  set_env_var DATABASE_DIRECT_URL "${default_database_url}"
fi

for secret_key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET TOTP_ENCRYPTION_SECRET; do
  if is_blank_or_placeholder "$(get_env_var "${secret_key}")"; then
    set_env_var "${secret_key}" "$(generate_hex 32)"
  fi
done

if is_blank_or_placeholder "$(get_env_var XRAY_SHORT_IDS)"; then
  set_env_var XRAY_SHORT_IDS "$(generate_hex 8)"
fi

xray_image="$(get_env_var XRAY_IMAGE)"
xray_image="${xray_image:-ghcr.io/xtls/xray-core:26.2.6}"

if is_blank_or_placeholder "$(get_env_var XRAY_REALITY_PRIVATE_KEY)" || is_blank_or_placeholder "$(get_env_var XRAY_REALITY_PUBLIC_KEY)"; then
  mapfile -t reality_keypair < <(generate_reality_keys "${xray_image}")
  set_env_var XRAY_REALITY_PRIVATE_KEY "${reality_keypair[0]}"
  set_env_var XRAY_REALITY_PUBLIC_KEY "${reality_keypair[1]}"
fi

initial_admin_username="$(get_env_var INITIAL_ADMIN_USERNAME)"
if [[ -n "${ADMIN_USERNAME_OVERRIDE}" ]]; then
  initial_admin_username="${ADMIN_USERNAME_OVERRIDE}"
elif is_blank_or_placeholder "${initial_admin_username}"; then
  initial_admin_username="admin"
fi
set_env_var INITIAL_ADMIN_USERNAME "${initial_admin_username}"

initial_admin_email="$(get_env_var INITIAL_ADMIN_EMAIL)"
if [[ -n "${ADMIN_EMAIL_OVERRIDE}" ]]; then
  initial_admin_email="${ADMIN_EMAIL_OVERRIDE}"
elif is_blank_or_placeholder "${initial_admin_email}"; then
  initial_admin_email="admin@vpn.local"
fi
set_env_var INITIAL_ADMIN_EMAIL "${initial_admin_email}"

generated_admin_password=""
initial_admin_password="$(get_env_var INITIAL_ADMIN_PASSWORD)"
if [[ -n "${ADMIN_PASSWORD_OVERRIDE}" ]]; then
  initial_admin_password="${ADMIN_PASSWORD_OVERRIDE}"
elif is_blank_or_placeholder "${initial_admin_password}" || [[ "${#initial_admin_password}" -lt 12 ]]; then
  generated_admin_password="$(generate_admin_password)"
  initial_admin_password="${generated_admin_password}"
fi

if [[ "${#initial_admin_password}" -lt 12 ]]; then
  error "INITIAL_ADMIN_PASSWORD must be at least 12 characters."
fi

set_env_var INITIAL_ADMIN_PASSWORD "${initial_admin_password}"

log "Running deploy.sh"
bash "${ROOT_DIR}/infra/scripts/deploy.sh"
write_install_summary "${initial_admin_password}"
print_install_summary "${initial_admin_password}"
