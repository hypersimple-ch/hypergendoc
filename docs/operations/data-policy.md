# MVP data and operations policy

## Storage

PostgreSQL stores identity, tenant metadata, structured styles, immutable original document bodies and formats, their combined identity hashes, version pointers, render metadata, credential hashes, and audit records. Private Garage S3-compatible storage holds logos, internal deterministic fully styled HTML render evidence, and PDFs. Buckets have no anonymous access. Garage's S3 endpoint is internal at `http://object-store:3900` in region `garage`; its S3, RPC, and admin interfaces are never public.

The original exact submitted body and explicit `"markdown"` or `"html"` format are immutable database input. The fully styled HTML is private render evidence with `text/html`; it is never presented as the submitted input. The authorized input route returns only the original body as a `text/plain; charset=utf-8` attachment named `.md` or `.html`. PDFs remain private authorized artifacts.

## Retention and deletion

- Active customer data is retained until an authorized owner deletes it or the workspace is closed.
- Normal versioning never overwrites or prunes previous style/document versions.
- Deletion creates an auditable purge job. New access is denied immediately; database and object deletion is retried idempotently where the application owns it.
- Workspace deletion requires recent owner authentication and explicit confirmation. At least one owner must remain until closure.
- The approved replacement deployment cleanup may destructively purge pre-replacement document history and render metadata after operator review and retained approval/audit evidence.
- SQL deletion removes database rows and metadata; it does **not** delete old Garage object bytes. During deployment cleanup, operators must separately identify and delete stale object bytes from Garage, then record the reconciliation.
- Application backups are encrypted and retained off-VPS on a finite 30-day rolling schedule for the MVP. Restore access is restricted and audited operationally.
- Purged live data may remain in encrypted backups until backup expiry. This limitation must be disclosed; no regulatory compliance claim is made without counsel.

## Backup and recovery

Back up PostgreSQL consistently with private object content and metadata manifests. Encrypt before transfer off the VPS. Daily automated backups and periodic restore drills are required. Garage is a single-node `replication_factor=1` deployment with no redundancy (Garage documents RF=1 as test-only), so these backups are mandatory. Keep the Garage SQLite metadata and object-data volumes together during local incident response, but use the logical encrypted backup for portable off-VPS recovery; do not automatically delete orphaned legacy object-store volumes. A release records the last successful restore, migration version, and recovery point. Scripts must fail closed when destination, encryption, or integrity checks are missing. The future HA path is three Garage nodes across three zones with RF=3.

## Limits and abuse controls

Initial limits are 256 KiB body, 10 MiB logo, 25 MiB PDF, 30-second render wall clock, and 100 pages. The renderer runs one job and accepts at most one additional queued job, with per-job cleanup. The server also bounds pagination, concurrent work, auth attempts, API requests, and MCP key requests. Production configuration cannot set security limits to unlimited.

## Privacy and logs

Do not log passwords, session cookies, verification/reset links, MCP token plaintext, document bodies, private render evidence, signed URLs, or renderer transcripts. Structured logs include request ID, actor/credential ID, workspace ID, event name, status, duration, and safe error code. User-provided titles and filenames are excluded from security logs by default.

## Operational dependencies

Production requires TLS, SMTP for verification/reset, off-VPS encrypted backup storage, DNS, and time synchronization. Secrets are injected at runtime and rotated with documented procedures. Internal database, object storage, and renderer endpoints are never public.
