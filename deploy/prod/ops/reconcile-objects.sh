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
# AWS CLI automatically paginates. Text output separates keys with tabs on each page.
run_compose run -T --rm --no-deps object-store-tools \
  s3api list-objects-v2 --bucket "$(awk -F= '$1 == "S3_BUCKET" { print $2 }' "$ENV_FILE")" \
  --query 'Contents[].Key' --output text \
  | tr '\t' '\n' | sed '/^None$/d' | sort -u > "$stage/bucket"
comm -23 "$stage/database" "$stage/bucket" > "$stage/missing"
comm -13 "$stage/database" "$stage/bucket" > "$stage/orphaned"
if [ -s "$stage/missing" ] || [ -s "$stage/orphaned" ]; then
  echo "object reconciliation found drift" >&2
  sed 's/^/missing: /' "$stage/missing" >&2
  sed 's/^/orphaned: /' "$stage/orphaned" >&2
  exit 1
fi
echo "object reconciliation passed: database and private bucket keys match"
