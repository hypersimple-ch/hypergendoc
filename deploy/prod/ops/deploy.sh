#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
"$(dirname "$0")/bootstrap.sh"

new_tag=$(awk -F= '$1 == "IMAGE_TAG" { print $2 }' "$ENV_FILE")
[ -n "$new_tag" ] || { echo "IMAGE_TAG is required" >&2; exit 1; }
current_file="$ROOT/deploy/prod/state/current-image-tag"
previous_file="$ROOT/deploy/prod/state/previous-image-tag"

# Build first so a failed build cannot change running containers.
run_compose build web server db-migrate renderer object-store object-store-init
CONFIRM_MIGRATE=APPLY ENV_FILE="$ENV_FILE" "$(dirname "$0")/migrate.sh"
run_compose up -d --wait --wait-timeout 180 --no-build --remove-orphans web server renderer postgres object-store object-store-init
run_compose ps

if [ -f "$current_file" ] && [ "$(cat "$current_file")" != "$new_tag" ]; then
  cp "$current_file" "$previous_file"
fi
printf '%s\n' "$new_tag" > "$current_file"
echo "release deployed; configure Dokploy domains, then run smoke.sh against $(awk -F= '$1 == "APP_ORIGIN" { print $2 }' "$ENV_FILE")"
