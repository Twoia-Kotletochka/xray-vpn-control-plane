#!/usr/bin/env bash
set -euo pipefail

interface_name="${WIREGUARD_INTERFACE:-wg0}"
config_path="${WIREGUARD_CONFIG_PATH:-/var/lib/server-vpn/wireguard/generated/wg0.conf}"
runtime_dump_path="${WIREGUARD_RUNTIME_DUMP_PATH:-/var/lib/server-vpn/wireguard/runtime/wg-show.dump}"
runtime_interval_ms="${WIREGUARD_RUNTIME_SYNC_INTERVAL_MS:-60000}"
log_file="/var/log/server-vpn/wireguard.log"

interval_seconds=$(( runtime_interval_ms / 1000 ))
if [[ "${interval_seconds}" -lt 5 ]]; then
  interval_seconds=5
fi

log() {
  local message="$1"
  printf '%s %s\n' "$(date -Is)" "${message}" | tee -a "${log_file}" >/dev/null
}

wait_for_config() {
  mkdir -p "$(dirname "${config_path}")" "$(dirname "${runtime_dump_path}")" "$(dirname "${log_file}")"

  until [[ -s "${config_path}" ]] && grep -q '^\[Interface\]' "${config_path}"; do
    log "waiting for rendered config at ${config_path}"
    sleep 2
  done
}

config_hash() {
  sha256sum "${config_path}" | awk '{print $1}'
}

sync_interface() {
  local tmp_file
  tmp_file="$(mktemp)"
  wg-quick strip "${config_path}" > "${tmp_file}"
  wg syncconf "${interface_name}" "${tmp_file}"
  rm -f "${tmp_file}"
}

bring_interface_online() {
  if ip link show "${interface_name}" >/dev/null 2>&1; then
    sync_interface
    log "synchronized existing interface ${interface_name}"
    return
  fi

  wg-quick up "${config_path}"
  log "brought interface ${interface_name} online"
}

write_runtime_dump() {
  wg show all dump > "${runtime_dump_path}"
}

cleanup() {
  if ip link show "${interface_name}" >/dev/null 2>&1; then
    wg-quick down "${config_path}" >/dev/null 2>&1 || true
    log "brought interface ${interface_name} down"
  fi
}

trap cleanup EXIT INT TERM

wait_for_config
bring_interface_online
last_hash="$(config_hash)"

while true; do
  current_hash="$(config_hash)"

  if [[ "${current_hash}" != "${last_hash}" ]]; then
    sync_interface
    last_hash="${current_hash}"
    log "applied config update to ${interface_name}"
  fi

  write_runtime_dump
  sleep "${interval_seconds}"
done
