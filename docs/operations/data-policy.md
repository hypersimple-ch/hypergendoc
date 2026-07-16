# MVP data and operations policy

## Storage

PostgreSQL stores identity, tenant metadata, structured styles, immutable LaTeX bodies/resolved-source metadata, version pointers, render metadata, credentials hashes, and audit records. Private Garage S3-compatible storage holds logos, resolved source artifacts when configured, and PDFs. Buckets have no anonymous access. Garage's S3 endpoint is internal at `http://object-store:3900` in region `garage`; its S3, RPC, and admin interfaces are never public.

## Retention and deletion

- Active customer data is retained until an authorized owner deletes it or the workspace is closed.
- Normal versioning never overwrites or prunes previous style/document versions.
- Deletion creates an auditable purge job. New access is denied immediately; object and dependent-row deletion is retried idempotently.
- Workspace deletion requires recent owner authentication and explicit confirmation. At least one owner must remain until closure.
- Application backups are encrypted and retained off-VPS on a finite 30-day rolling schedule for the MVP. Restore access is restricted and audited operationally.
- Purged live data may remain in encrypted backups until backup expiry. This limitation must be disclosed; no regulatory compliance claim is made without counsel.

## Backup and recovery

Back up PostgreSQL consistently with private object content and metadata manifests. Encrypt before transfer off the VPS. Daily automated backups and periodic restore drills are required. Garage is a single-node `replication_factor=1` deployment with no redundancy (Garage documents RF=1 as test-only), so these backups are mandatory. Keep the Garage SQLite metadata and object-data volumes together during local incident response, but use the logical encrypted backup for portable off-VPS recovery; do not automatically delete orphaned legacy object-store volumes. A release records the last successful restore, migration version, and recovery point. Scripts must fail closed when destination, encryption, or integrity checks are missing. The future HA path is three Garage nodes across three zones with RF=3.

## Limits and abuse controls

Initial limits are 256 KiB body, 10 MiB logo, 25 MiB PDF, and 30-second render wall clock. The server also bounds parser complexity, pages, processes, memory, CPU, pagination, concurrent renders, auth attempts, API requests, and MCP key requests. Production configuration cannot set security limits to unlimited.

## Privacy and logs

Do not log passwords, session cookies, verification/reset links, MCP token plaintext, document bodies, resolved source, signed URLs, or compiler transcripts. Structured logs include request ID, actor/credential ID, workspace ID, event name, status, duration, and safe error code. User-provided titles and filenames are excluded from security logs by default.

## Operational dependencies

Production requires TLS, SMTP for verification/reset, off-VPS encrypted backup storage, DNS, and time synchronization. Secrets are injected at runtime and rotated with documented procedures. Internal database, object storage, and renderer endpoints are never public.
