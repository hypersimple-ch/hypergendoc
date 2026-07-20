# Operations runbook

Dokploy deploys the standalone Compose service. Traefik is the only public entry point; do not expose PostgreSQL, object storage, the private Git volume, renderer IPC, or internal server ports.

## Deploy and review

1. Set runtime secrets in Dokploy; do not commit them.
2. Deploy migrations and application services, then verify health and authenticated smoke checks.
3. Run `pnpm check` before release.
4. Monitor server, PostgreSQL, Git-volume capacity, object storage, renderer, and backup/restore failures. Do not log document source, tokens, or renderer transcripts.

## Git history operations

One durable private Git repository belongs to each company. It is source-history authority and is not directly served. Company archival retains the repository. Purge is out of scope; do not delete repository contents ad hoc.

PostgreSQL is only the document index and authorization store. Object storage is only for logos/styles, never document source, generated HTML, PDFs, or render records. Current PDFs are rendered in memory and are not a backup artifact.

## Backup and restore

Create a consistent recovery set containing the PostgreSQL dump and private Git volume, plus object storage for logos/styles. Encrypt before off-VPS transfer. Daily backups, integrity checks, and periodic isolated restore drills are required.

Restore PostgreSQL and Git from the same recovery point before accepting traffic, then verify authorized document reads, commit history, a revert, and a current-PDF render. Record the recovery point, migration version, consistency result, and last successful full restore. Do not restore partial Git history into a live deployment.

Garage is single-node `replication_factor=1` and has no redundancy. Keep its metadata and object-data volumes together during local incident response; encrypted off-VPS logical backups are the portable recovery mechanism.

## Incident response

For suspected tenant exposure, revoke credentials or contain sessions, preserve safe request IDs and audit metadata, and verify that cross-tenant probes remain `not_found`. Do not copy bodies, tokens, commit source, or renderer transcripts into tickets. See the [security runbook](../security/runbook.md).
