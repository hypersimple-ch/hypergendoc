#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
: "${PURGE_SQL_FILE:?set PURGE_SQL_FILE to a reviewed SQL file}"
[ -f "$PURGE_SQL_FILE" ] || { echo "SQL file not found" >&2; exit 1; }
if [ "${CONFIRM_PURGE:-}" != "PURGE" ]; then
  echo "dry run: would send reviewed SQL to PostgreSQL. Set CONFIRM_PURGE=PURGE to apply it."
  exit 0
fi
# The database's purge guard remains authoritative; this script never constructs tenant deletion SQL.
run_compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$PURGE_SQL_FILE"
echo "purge SQL completed; reconcile-objects.sh is inventory-only and must not be used to delete artifacts."
