#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT/deploy/prod/secrets.env"}
COMPOSE="docker compose --env-file $ENV_FILE -f $ROOT/compose.prod.yaml"

require_env_file() {
  [ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy secrets.env.example and set real values)" >&2; exit 1; }
  [ "$(stat -c %a "$ENV_FILE" 2>/dev/null || echo 600)" = "600" ] || echo "warning: $ENV_FILE should be chmod 600" >&2
}

run_compose() {
  # shellcheck disable=SC2086
  $COMPOSE "$@"
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "required command not found: $1" >&2; exit 1; }; }

confirm() {
  expected=$1
  actual=${2:-}
  [ "$actual" = "$expected" ] || { echo "refusing: set $3=$expected" >&2; exit 2; }
}
