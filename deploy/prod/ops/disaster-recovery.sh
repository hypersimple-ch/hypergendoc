#!/bin/sh
set -eu
# A non-destructive DR drill: validates that an encrypted backup can be decrypted and structurally restored.
. "$(dirname "$0")/lib.sh"
require_env_file
: "${BACKUP_FILE:?set BACKUP_FILE to a downloaded encrypted backup}"
: "${AGE_IDENTITY:?set AGE_IDENTITY to the age identity file}"
BACKUP_FILE="$BACKUP_FILE" AGE_IDENTITY="$AGE_IDENTITY" CONFIRM_RESTORE= "$(dirname "$0")/restore.sh"
echo "DR drill passed archive validation. A full restore requires an isolated VPS and CONFIRM_RESTORE=RESTORE."
