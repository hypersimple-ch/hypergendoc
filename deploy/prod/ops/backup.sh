#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
DRY_RUN=${DRY_RUN:-1}
: "${BACKUP_SSH_HOST:?set BACKUP_SSH_HOST (for example backup@host)}"
: "${BACKUP_REMOTE_DIR:?set BACKUP_REMOTE_DIR (for example /srv/hypergendoc)}"
: "${AGE_RECIPIENT:?set AGE_RECIPIENT to an age recipient}"
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
case "$BACKUP_SSH_HOST" in ''|-*|*[!A-Za-z0-9_.@-]*) echo "BACKUP_SSH_HOST contains unsupported characters" >&2; exit 2;; esac
case "$BACKUP_REMOTE_DIR" in *[!A-Za-z0-9_./-]*) echo "BACKUP_REMOTE_DIR contains unsupported characters" >&2; exit 2;; esac
case "$BACKUP_RETENTION_DAYS" in ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 2;; esac
[ "$BACKUP_RETENTION_DAYS" -gt 0 ] || { echo "BACKUP_RETENTION_DAYS must be positive" >&2; exit 2; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="hypergendoc-$stamp.tar.age"
if [ "$DRY_RUN" != 0 ]; then
  echo "dry run: dump PostgreSQL and private bucket, encrypt with age, upload $archive to $BACKUP_SSH_HOST:$BACKUP_REMOTE_DIR, and remove backups older than $BACKUP_RETENTION_DAYS days"
  exit 0
fi
need age
need ssh
need tar
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir -p "$stage/objects"
expected_objects=$(run_compose exec -T postgres sh -ec \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM stored_objects WHERE deleted_at IS NULL"')
run_compose exec -T postgres sh -ec 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$stage/database.sql"
run_compose run -T --rm --no-deps --cap-add CHOWN --cap-add FOWNER --cap-add DAC_OVERRIDE \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$stage:/backup" --entrypoint /bin/sh object-store-init -ec '
  mc alias set local http://object-store:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
  mc mirror --overwrite "local/$S3_BUCKET" /backup/objects
  chown -R "$HOST_UID:$HOST_GID" /backup/objects
  chmod -R u+rwX /backup/objects
'
actual_objects=$(find "$stage/objects" -type f | wc -l | tr -d ' ')
[ "$actual_objects" = "$expected_objects" ] || {
  echo "refusing incomplete backup: database has $expected_objects active objects, bucket export has $actual_objects" >&2
  exit 1
}
printf 'created_at=%s\nimage_tag=%s\nobject_count=%s\n' "$stamp" "$(awk -F= '$1 == "IMAGE_TAG" {print $2}' "$ENV_FILE")" "$actual_objects" > "$stage/manifest"
tar -C "$stage" -cf "$stage/backup.tar" database.sql objects manifest
age -r "$AGE_RECIPIENT" -o "$stage/$archive" "$stage/backup.tar"
ssh "$BACKUP_SSH_HOST" "umask 077; mkdir -p '$BACKUP_REMOTE_DIR'; cat > '$BACKUP_REMOTE_DIR/$archive'" < "$stage/$archive"
ssh "$BACKUP_SSH_HOST" "find '$BACKUP_REMOTE_DIR' -maxdepth 1 -type f -name 'hypergendoc-*.tar.age' -mtime +$BACKUP_RETENTION_DAYS -delete"
echo "encrypted backup uploaded as $BACKUP_SSH_HOST:$BACKUP_REMOTE_DIR/$archive; retention is $BACKUP_RETENTION_DAYS days"
