#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
if [ "${CONFIRM_MIGRATE:-}" != "APPLY" ]; then
  echo "dry run: migration image and Compose configuration would be validated. Set CONFIRM_MIGRATE=APPLY to run migrations."
  run_compose config --quiet
  exit 0
fi
# A one-shot migration container exits non-zero on failure; deploy.sh will not start a new release after that.
run_compose run --rm --no-deps db-migrate
