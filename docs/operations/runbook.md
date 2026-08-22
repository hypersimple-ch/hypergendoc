# Operations runbook

Dokploy deploys the standalone Compose service. Traefik is the only public entry point; do not expose PostgreSQL, object storage, the private Git volume, renderer IPC, or internal server ports.

## Deploy and review

1. Set runtime secrets in Dokploy; do not commit them.
2. Deploy migrations and application services, then verify health and authenticated smoke checks.
3. Run `pnpm check` before release.
4. Monitor server, PostgreSQL, Git-volume capacity, object storage, renderer, and backup/restore failures. Do not log document source, tokens, or renderer transcripts.

## Scaling guard

Run exactly one `server` replica while authentication and MCP rate-limit counters are process-local. Do not configure Dokploy or Traefik horizontal scaling for the server. Before adding a second replica, implement and load-test a shared atomic rate-limit store as required by [ADR 0001](../architecture/decisions/0001-lifecycle-and-scaling-boundaries.md).

## Browser security headers

The Next.js web service emits CSP, frame protection, MIME protection, referrer, permissions, cross-origin isolation, and production HSTS headers for every page. Development Caddy and production Traefik must preserve these upstream response headers. After an ingress change, verify `/`, `/login`, and an authenticated `/workspace` page and confirm that browser console output contains no CSP violation.

## Git history operations

One durable private Git repository belongs to each company. It is source-history authority and is not directly served. Company archival retains the repository. Purge is out of scope; do not delete repository contents ad hoc.

PostgreSQL is only the document index and authorization store. Object storage is only for uploaded logos, fonts, and validated template media, never document source, generated HTML, PDFs, or render records. Current PDFs are rendered in memory and are not a backup artifact.

## Backup and restore

Create a consistent recovery set containing the PostgreSQL dump and private Git volume, plus object storage for uploaded logos, fonts, and template media. Encrypt before off-VPS transfer. Daily backups, integrity checks, and periodic isolated restore drills are required.

Restore PostgreSQL and Git from the same recovery point before accepting traffic, then verify authorized document reads, commit history, a revert, and a current-PDF render. Record the recovery point, migration version, consistency result, and last successful full restore. Do not restore partial Git history into a live deployment.

In Compose, Garage stores metadata and object bytes in the Docker named volumes `object-metadata` and `object-data`, mounted inside the container at `/var/lib/garage/meta` and `/var/lib/garage/data`; these paths are not application-host directories. Style definitions remain in PostgreSQL, while opaque `private/` object keys contain only uploaded logo, font, and validated template-media bytes.

Garage is single-node `replication_factor=1` and has no redundancy. Keep its metadata and object-data volumes together during local incident response; encrypted off-VPS logical backups are the portable recovery mechanism.

## Incident response

For suspected tenant exposure, revoke credentials or contain sessions, preserve safe request IDs and audit metadata, and verify that cross-tenant probes remain `not_found`. Do not copy bodies, tokens, commit source, or renderer transcripts into tickets. See the [security runbook](../security/runbook.md).

## Authentication mail queue

Authentication email is accepted only after its `mail_jobs` row commits in PostgreSQL. The server dispatcher claims at most 10 due jobs at a time with `FOR UPDATE SKIP LOCKED` and a 60-second lease. It retries transport failures with exponential backoff from 30 seconds, capped at one hour. Attempt 8 is terminal.

Safe events are `mail.delivered`, `mail.retry_scheduled`, `mail.dead_lettered`, `mail.leases_recovered`, `mail.dispatch_failed`, and `mail.dispatcher_unavailable`. They contain a job ID, kind, attempt, and delay/count only. Never add recipients, message bodies, SMTP errors, or single-use URLs to logs or tickets.

On startup the dispatcher returns expired leases to `pending`; graceful shutdown stops new polls and waits for the active bounded batch. After an SMTP incident:

1. Restore and verify SMTP configuration without copying credentials into logs or commands recorded in tickets.
2. Restart the server. Confirm `mail.leases_recovered` if the old process died mid-batch.
3. Query aggregate status and age only, for example `SELECT status, count(*), min(created_at) FROM mail_jobs GROUP BY status`.
4. Confirm pending counts fall and deliveries rise. A `sent` row means SMTP accepted the message, not that the recipient read it.
5. Investigate `dead` jobs by safe job ID. Their single-use URL has already been erased. Do not replay them. Ask the user to request a fresh verification or reset link after the transport is healthy.

When SMTP is absent the dispatcher does not run and emits `mail.dispatcher_unavailable`; jobs remain pending. This is durable acceptance, not delivery. Configure SMTP and restart to recover them.

## Recovering partial Git and object-store mutations

External side effects must create a `mutation_operations` row before writing Git or S3. The row uses a workspace-scoped idempotency key. It stores only safe coordinates: operation type, target IDs, and an opaque Git checkpoint or object key. It must never store tokens, request bodies, document bodies, file bytes, or raw error text.

State transitions are `pending` → `external_applied` → `completed`. The bounded reconciler claims work as `reconciling`. A process interruption or final database failure moves the row to `reconcile_required` with an allow-listed `safe_error_code`. The server runs operation-specific Git/S3 recovery once at startup and every 30 seconds. Stale `pending` and `reconciling` leases are reclaimed after five minutes. Handlers must verify the target and external reference before completing or removing an orphan. Retrying `begin` with the same workspace and idempotency key returns the existing operation; a different operation type is rejected.

Alert on old `pending`, `external_applied`, `reconciling`, or `reconcile_required` rows. Do not delete journal rows to hide failures. Investigate the safe code and run the reconciler again after fixing the dependency.

PostgreSQL-only domain mutations write their success audit event through the same Drizzle transaction. An audit insert error therefore rolls the business mutation back. Credential creation returns its one-time token only after that transaction commits.
