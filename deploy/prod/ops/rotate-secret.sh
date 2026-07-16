#!/bin/sh
set -eu
. "$(dirname "$0")/lib.sh"
require_env_file
SECRET_NAME=${SECRET_NAME:-}
case "$SECRET_NAME" in BETTER_AUTH_SECRET|CREDENTIAL_PEPPER) ;; *) echo "set SECRET_NAME to BETTER_AUTH_SECRET or CREDENTIAL_PEPPER; database and S3 root credentials require coordinated service-side rotation" >&2; exit 2;; esac
confirm ROTATE "${CONFIRM_ROTATE:-}" CONFIRM_ROTATE
need openssl
new=$(openssl rand -base64 48 | tr -d '\n')
tmp=$(mktemp "${ENV_FILE}.XXXXXX")
trap 'rm -f "$tmp"' EXIT HUP INT TERM
awk -v key="$SECRET_NAME" -v value="$new" -F= '
  $1 == key { print key "=" value; found=1; next } { print } END { if (!found) exit 3 }
' "$ENV_FILE" > "$tmp" || { echo "secret name absent from env file" >&2; exit 1; }
chmod 600 "$tmp"
mv "$tmp" "$ENV_FILE"
echo "$SECRET_NAME rotated in $ENV_FILE. Deploy explicitly; this intentionally invalidates dependent sessions or credentials."
