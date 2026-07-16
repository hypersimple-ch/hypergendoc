#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
current_file="$ROOT/deploy/prod/state/current-image-tag"
previous_file="$ROOT/deploy/prod/state/previous-image-tag"
TAG=${ROLLBACK_IMAGE_TAG:-}
if [ -z "$TAG" ] && [ -f "$previous_file" ]; then TAG=$(cat "$previous_file"); fi
[ -n "$TAG" ] || { echo "set ROLLBACK_IMAGE_TAG or deploy a prior immutable image first" >&2; exit 2; }
confirm ROLLBACK "${CONFIRM_ROLLBACK:-}" CONFIRM_ROLLBACK

# Do not run migrations during rollback: schema migrations are forward-only.
IMAGE_TAG=$TAG run_compose up -d --wait --wait-timeout 180 --no-build --no-deps web server renderer
IMAGE_TAG=$TAG run_compose ps
old_current=
if [ -f "$current_file" ]; then old_current=$(cat "$current_file"); fi
printf '%s\n' "$TAG" > "$current_file"
if [ -n "$old_current" ] && [ "$old_current" != "$TAG" ]; then
  printf '%s\n' "$old_current" > "$previous_file"
fi
echo "rollback started for image tag $TAG; verify with smoke.sh. Database migrations were not reversed."
