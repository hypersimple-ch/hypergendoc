# Operations runbook

This is an MVP operational checklist, not evidence of a production deployment. Production is a Dokploy Compose service using the standalone `compose.prod.yaml`; Dokploy's host-level Traefik owns public ports, TLS, and routing. The application stack publishes no host ports.

## Dokploy deployment

1. Create a Dokploy **Compose** service from this repository and set its Compose path to `compose.prod.yaml`.
2. Copy the keys from `deploy/prod/secrets.env.example` into the Dokploy environment and replace every value. `APP_ORIGIN` must be the final HTTPS origin. Do not commit or bake these values into images.
3. Add the following HTTPS/Let's Encrypt domain routes on the same hostname. Keep **Strip path** disabled for every route:

| Path prefix      | Service  | Container port |
| ---------------- | -------- | -------------: |
| `/api`           | `server` |           4000 |
| `/mcp`           | `server` |           4000 |
| `/mcp-artifacts` | `server` |           4000 |
| `/health`        | `server` |           4000 |
| `/`              | `web`    |           3000 |

The specific path rules must take precedence over `/`; Dokploy/Traefik normally derives this from rule specificity. Verify the generated routes after every domain change. Do not add external ports for web, server, PostgreSQL, MinIO, renderer, or migration services. The server route itself enforces the MCP 256 KiB body limit and returns HTTP 413, so no Caddy body-limit middleware is required.

4. Deploy through Dokploy. The one-shot `db-migrate`, `object-store-init`, and `renderer-socket-init` services must complete successfully before the server becomes healthy.
5. Run `SMOKE_ORIGIN=https://your-host deploy/prod/ops/smoke.sh` from a checkout that targets the deployed Compose project, then run the complete release acceptance suites. `certificate.sh` only verifies Dokploy's trusted HTTPS route; certificate issuance and renewal remain Dokploy responsibilities.

The scripts under `deploy/prod/ops` remain useful for VPS-equivalent drills and guarded maintenance from a checkout. Dokploy is the authoritative production deploy/rollback interface. Set Docker's `COMPOSE_PROJECT_NAME` when those scripts must target a Dokploy-managed project whose project name is not the local default.

## Release status

The production topology permits internal HTTP only for the isolated Compose service name `object-store`; external S3 endpoints must use HTTPS. `smoke.sh` validates HTTPS health and the rendered Compose policy, but it is not a substitute for clean-VPS deployment, two-tenant acceptance, renderer abuse testing, encrypted off-VPS backup/restore, and destructive-recovery evidence.

## Observe and review

Monitor Dokploy Traefik, web, server, PostgreSQL, object storage, migration jobs, and renderer availability. The server liveness endpoint is `/health/live`; the local development proxy remains `http://localhost:8080`. Alert on server/renderer failures, render timeouts/rejections, dependency-unavailable errors, elevated authentication/MCP failures, rate limiting, storage capacity, backup failure, and restore-drill failure.

Review owner audit events for membership, company/style changes, credential lifecycle, document creation/versioning/deletion, artifact access, login security events, and purge actions. Logs must retain request ID, actor/credential ID, workspace ID, event, status, duration, and safe error code—but not credentials, bodies, source, signed URLs, filenames, or compiler transcripts.

## Secrets, mail, and storage rotation

1. Record the change window, affected service, and audit reference. Create and verify an encrypted backup first.
2. Create replacement S3 or SMTP credentials in the provider and update the Dokploy environment, not committed files.
3. For S3, validate the private bucket and an authorized upload/download path before retiring the old key. For SMTP, validate a verification/reset message without exposing links in logs.
4. Redeploy only the affected release through Dokploy, observe health and safe errors, then revoke the old provider key.

`CREDENTIAL_PEPPER` is different: existing MCP credential hashes depend on it. There is no transparent pepper rotation; plan controlled credential reissue/revocation. Rotate `BETTER_AUTH_SECRET` only with an approved session-impact plan. Do not publish database, object-store, server, or renderer endpoints.

MinIO Community Edition is built from the exact upstream commits pinned in `deploy/prod/Dockerfile.object-store`, with explicit patched Go dependency versions. The stale public MinIO and `mc` binary images are not production inputs. Updating either pin requires rebuilding both targets, running S3 integration/backup/restore tests, and passing the HIGH/CRITICAL image scan before deployment.

## Backup and restore

Policy requires a consistent PostgreSQL dump plus private object-storage content, encryption before off-VPS transfer, daily execution, 30-day rolling retention, integrity verification, and periodic restore drills. `deploy/prod/ops/backup.sh` creates and verifies the combined archive, encrypts it with `age`, transfers it over SSH, and prunes expired archives. It defaults to a dry run. Schedule it on the VPS with the correct `COMPOSE_PROJECT_NAME`; remote storage access, age-key custody, monitoring, and retention review remain operator responsibilities.

`restore.sh` decrypts and structurally validates an archive by default; destructive replacement requires `CONFIRM_RESTORE=RESTORE`. Disable the Dokploy domain routes during replacement so Traefik cannot send traffic to partially restored services. For a full drill, restore into an isolated non-production Compose project, apply the required migration set, run authenticated read/revision checks, then destroy drill data. Never restore over live data without an approved incident procedure. Record destination, encryption recipient, integrity result, recovery point, migration version, and last successful full restore.

## Renderer incident

If rendering times out, rejects unexpectedly, leaks diagnostics, or isolation is suspect: stop accepting affected render work, preserve only non-sensitive request IDs and image versions, and do not collect bodies, tokens, or raw compiler output in general logs. Verify `network_mode: none`, read-only root, non-root user, dropped capabilities, resource limits, and the sole Unix-socket volume. Run the renderer adversarial suite in the production Compose topology. Do not weaken parser or container controls to restore service.

## Upgrades and rollback

Before an upgrade, run:

```sh
pnpm db:migrations:check
pnpm compose:check
pnpm check
docker compose --env-file deploy/prod/secrets.env -f compose.prod.yaml config --format json \
  | node deploy/prod/ops/assert-compose.mjs
```

Deploy immutable image tags through Dokploy, confirm the migration job, run smoke and acceptance checks, then record image and migration versions. Use Dokploy's rollback for application images only; migrations remain forward-only. Stop a failed rollout and use a verified backup restore only under an approved schema-recovery procedure. Do not claim rollback readiness without a tested drill.
