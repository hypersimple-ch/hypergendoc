#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
: "${BACKUP_FILE:?set BACKUP_FILE to a local encrypted backup}"
: "${AGE_IDENTITY:?set AGE_IDENTITY to the age identity file}"
need age
[ -f "$BACKUP_FILE" ] || { echo "backup not found: $BACKUP_FILE" >&2; exit 1; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT HUP INT TERM
age -d -i "$AGE_IDENTITY" -o "$stage/backup.tar" "$BACKUP_FILE"
tar -tf "$stage/backup.tar" | grep -qx 'database.sql' && tar -tf "$stage/backup.tar" | grep -q '^objects/' || { echo "invalid backup layout" >&2; exit 1; }
mkdir "$stage/unpacked"
tar -C "$stage/unpacked" -xf "$stage/backup.tar"
expected_objects=$(sed -n 's/^object_count=//p' "$stage/unpacked/manifest")
case "$expected_objects" in ''|*[!0-9]*) echo "backup manifest has no valid object count" >&2; exit 1;; esac
actual_objects=$(find "$stage/unpacked/objects" -type f | wc -l | tr -d ' ')
[ "$actual_objects" = "$expected_objects" ] || { echo "backup object count mismatch" >&2; exit 1; }
if [ "${CONFIRM_RESTORE:-}" != "RESTORE" ]; then
  echo "backup decrypts and contains $actual_objects verified objects. Dry run only; set CONFIRM_RESTORE=RESTORE to replace database and objects."
  exit 0
fi
# Stop application writers before replacement. Disable Dokploy routes during the approved restore window.
run_compose stop web server
run_compose exec -T postgres sh -ec 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
run_compose exec -T postgres sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$stage/unpacked/database.sql"
run_compose run -T --rm --no-deps -v "$stage/unpacked:/backup:ro" --entrypoint /bin/sh object-store-init -ec '
  mc alias set local http://object-store:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
  mc mirror --overwrite --remove /backup/objects "local/$S3_BUCKET"
'
echo "restore complete; inspect data, then explicitly redeploy or restart services through Dokploy."
