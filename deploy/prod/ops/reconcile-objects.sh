#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
if [ "${CONFIRM_RECONCILE:-}" != "APPLY" ]; then
  echo "dry run: compare active database object keys with the private bucket. Set CONFIRM_RECONCILE=APPLY to query it."
  exit 0
fi
need sort
need comm
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT HUP INT TERM
run_compose exec -T postgres sh -ec \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT object_key FROM stored_objects WHERE deleted_at IS NULL ORDER BY object_key"' \
  | sort -u > "$stage/database"
run_compose run -T --rm --no-deps --entrypoint /bin/sh object-store-init -ec '
  mc alias set local http://object-store:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  mc find "local/$S3_BUCKET"
' | sed "s#^local/$(awk -F= '$1 == "S3_BUCKET" { print $2 }' "$ENV_FILE")/##" | sort -u > "$stage/bucket"
comm -23 "$stage/database" "$stage/bucket" > "$stage/missing"
comm -13 "$stage/database" "$stage/bucket" > "$stage/orphaned"
if [ -s "$stage/missing" ] || [ -s "$stage/orphaned" ]; then
  echo "object reconciliation found drift" >&2
  sed 's/^/missing: /' "$stage/missing" >&2
  sed 's/^/orphaned: /' "$stage/orphaned" >&2
  exit 1
fi
echo "object reconciliation passed: database and private bucket keys match"
