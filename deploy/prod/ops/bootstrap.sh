#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
need docker
require_env_file
need awk

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required" >&2
  exit 1
fi
mkdir -p "$ROOT/deploy/prod/state" "$ROOT/deploy/prod/backups"
chmod 700 "$ROOT/deploy/prod/state" "$ROOT/deploy/prod/backups"
chmod 600 "$ENV_FILE" 2>/dev/null || true
run_compose config --quiet
echo "bootstrap checks complete; no containers or host firewall settings were changed."
