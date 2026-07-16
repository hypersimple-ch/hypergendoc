#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
need curl
APP_ORIGIN=$(awk -F= '$1 == "APP_ORIGIN" {sub(/^[^=]*=/, ""); print}' "$ENV_FILE")
[ -n "$APP_ORIGIN" ] || { echo "APP_ORIGIN is required" >&2; exit 1; }
case "$APP_ORIGIN" in https://*) ;; *) echo "APP_ORIGIN must use HTTPS" >&2; exit 1;; esac
base=${SMOKE_ORIGIN:-"$APP_ORIGIN"}
curl --fail --silent --show-error --proto '=https' --max-time 15 "$base/health/live" >/dev/null
curl --fail --silent --show-error --proto '=https' --max-time 15 "$base/health/ready" >/dev/null
run_compose ps --status running
run_compose config --format json | node "$ROOT/deploy/prod/ops/assert-compose.mjs"
echo "smoke test passed: Dokploy HTTPS health routes are reachable and the application stack publishes no host ports."
