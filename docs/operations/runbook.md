# Operations runbook

Dokploy deploys the standalone Compose service. Traefik is the only public entry point; do not expose PostgreSQL, object storage, the private Git volume, renderer IPC, or internal server ports.

## Ingress route settings

Configure exactly these HTTPS rules on the single deployment hostname in Dokploy/Traefik. Keep strip-path disabled on every rule: the server serves `/api/auth/*`, `/mcp`, and `/health/*` at those exact prefixes, and the web service expects the root prefix.

| Path prefix | Upstream      | Strip path |
| ----------- | ------------- | ---------- |
| `/api`      | `server:4000` | No         |
| `/mcp`      | `server:4000` | No         |
| `/health`   | `server:4000` | No         |
| `/`         | `web:3000`    | No         |

A wrong strip-path setting silently breaks every API call while pages keep loading, so re-run `deploy/prod/ops/smoke.sh` after any ingress change. The production Compose file sets `TRUST_PROXY: "1"` so the server resolves real client IPs from Traefik's `X-Forwarded-For` header.

## Deploy and review

1. Set runtime secrets in Dokploy; do not commit them.
2. Deploy migrations and application services, then verify health and authenticated smoke checks.
3. Run `pnpm check` before release.
4. Monitor server, PostgreSQL, Git-volume capacity, object storage, renderer, and backup/restore failures. Do not log document source, tokens, or renderer transcripts.

## Base-image pinning

Production Dockerfiles pin every base image by tag and registry digest, matching the Garage and AWS CLI images already pinned in `compose.prod.yaml`. Refresh deliberately: choose the new tag, resolve its digest from the registry, update tag and digest together, and redeploy. Never replace a tag without moving its digest.

## Scaling guard

Run exactly one `server` replica while authentication and MCP rate-limit counters are process-local. Do not configure Dokploy or Traefik horizontal scaling for the server. Before adding a second replica, implement and load-test a shared atomic rate-limit store as required by [ADR 0001](../architecture/decisions/0001-lifecycle-and-scaling-boundaries.md).

## Public registration policy

`SIGNUP_MODE` controls public registration and is enforced server-side, not just in the UI:

- `open` (default): anyone may register. Email verification is still mandatory before any workspace access.
- `invite`: public sign-ups are rejected by the server with `403`. New users must be provisioned by an operator.
- `closed`: identical enforcement to `invite` today; kept as an explicit value so a deployment can document that registration is permanently closed. It is reserved for a future token-gated sign-up flow.

Bootstrap procedure for an agency deployment: deploy once with `SIGNUP_MODE=open`, register and verify the owner account through `/register` and `/setup`, then set `SIGNUP_MODE=closed` (or `invite`) and redeploy through Dokploy. Workspace member invitations require the invited user to already exist as a verified account; they never create accounts, so closing registration does not affect inviting verified users into an existing workspace.

## Browser security headers

The Next.js web service emits CSP, frame protection, MIME protection, referrer, permissions, cross-origin isolation, and production HSTS headers for every page. Development Caddy and production Traefik must preserve these upstream response headers. After an ingress change, verify `/`, `/login`, and an authenticated `/workspace` page and confirm that browser console output contains no CSP violation.

## Git history operations

One durable private Git repository belongs to each company. It is source-history authority and is not directly served. Company archival retains the repository. Purge is out of scope; do not delete repository contents ad hoc.

PostgreSQL is only the document index and authorization store. Object storage is only for uploaded logos, fonts, and validated template media, never document source, generated HTML, PDFs, or render records. Current PDFs are rendered in memory and are not a backup artifact.

## Backup and restore

Create a consistent recovery set containing the PostgreSQL dump and private Git volume, plus object storage for uploaded logos, fonts, and template media. Encrypt before off-VPS transfer. Daily backups, integrity checks, and periodic isolated restore drills are required. `deploy/prod/ops/backup.sh` enforces this contract: it stages `database.sql`, `objects/`, and `git-data.tar` into one encrypted archive with a manifest, and `restore.sh` refuses any archive whose recovery set is incomplete or whose counts do not match the manifest.

### Backup scheduling

`backup.sh` refuses to run while `DRY_RUN` is unset or nonzero, so the scheduler must export `DRY_RUN=0` together with `ENV_FILE`, `AGE_RECIPIENT`, `BACKUP_SSH_HOST`, and `BACKUP_REMOTE_DIR`. Schedule it daily during a low-traffic window.

Host cron (`/etc/cron.d/hypergendoc-backup`; adjust paths to the deployment checkout):

```
ENV_FILE=/opt/hypergendoc/deploy/prod/secrets.env
BACKUP_RECIPIENT=age1replace-with-the-backup-age-recipient
BACKUP_TARGET=backup@backup-host.internal
BACKUP_DIR=/srv/hypergendoc
15 3 * * * root cd /opt/hypergendoc && \
  ENV_FILE="$ENV_FILE" DRY_RUN=0 AGE_RECIPIENT="$BACKUP_RECIPIENT" \
  BACKUP_SSH_HOST="$BACKUP_TARGET" BACKUP_REMOTE_DIR="$BACKUP_DIR" \
  sh deploy/prod/ops/backup.sh >>/var/log/hypergendoc-backup.log 2>&1
```

systemd timer equivalent:

```
# /etc/systemd/system/hypergendoc-backup.service
[Unit]
Description=HyperGenDoc encrypted off-VPS backup

[Service]
Type=oneshot
WorkingDirectory=/opt/hypergendoc
Environment=ENV_FILE=/opt/hypergendoc/deploy/prod/secrets.env
Environment=DRY_RUN=0
Environment=AGE_RECIPIENT=age1replace-with-the-backup-age-recipient
Environment=BACKUP_SSH_HOST=backup@backup-host.internal
Environment=BACKUP_REMOTE_DIR=/srv/hypergendoc
ExecStart=/bin/sh deploy/prod/ops/backup.sh

# /etc/systemd/system/hypergendoc-backup.timer
[Unit]
Description=Run HyperGenDoc daily backup

[Timer]
OnCalendar=*-*-* 03:15:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Enable it with `systemctl enable --now hypergendoc-backup.timer`.

Dokploy-friendly equivalent: add a Scheduled Job on the Compose project (field names vary slightly between Dokploy versions; adapt as needed):

```
name: hypergendoc-nightly-backup
schedule: "15 3 * * *"          # cron syntax
command: sh deploy/prod/ops/backup.sh   # runs in the compose project context
environment:
  ENV_FILE: /opt/hypergendoc/deploy/prod/secrets.env
  DRY_RUN: "0"
  AGE_RECIPIENT: age1replace-with-the-backup-age-recipient
  BACKUP_SSH_HOST: backup@backup-host.internal
  BACKUP_REMOTE_DIR: /srv/hypergendoc
```

The job needs the same host prerequisites as a manual run: an age keypair whose public key is `AGE_RECIPIENT`, passwordless SSH to `BACKUP_SSH_HOST`, and the checkout with `secrets.env` at chmod 600. Verify each scheduler change with a manual `DRY_RUN=0` run before relying on it, alert on nonzero exits or missing archives older than one day, and run `deploy/prod/ops/disaster-recovery.sh` against the latest archive after every scheduler change. Perform a full isolated restore drill at least quarterly and record the last successful date.

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
