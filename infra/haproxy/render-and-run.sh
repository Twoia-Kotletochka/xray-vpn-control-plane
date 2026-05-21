#!/usr/bin/env sh
set -eu

: "${PANEL_HOST:?PANEL_HOST is required}"
: "${XRAY_VLESS_PORT:?XRAY_VLESS_PORT is required}"

sed \
  -e "s#__PANEL_HOST__#${PANEL_HOST}#g" \
  -e "s#__XRAY_VLESS_PORT__#${XRAY_VLESS_PORT}#g" \
  /usr/local/etc/haproxy/haproxy.cfg.template > /tmp/haproxy.cfg

exec haproxy -f /tmp/haproxy.cfg
