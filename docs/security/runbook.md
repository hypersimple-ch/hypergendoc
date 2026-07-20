# Security runbook

## Suspected tenant breach

1. Preserve timestamps, request IDs, workspace/credential IDs, safe error codes, and deployment version. Do not copy document bodies, commit source, tokens, URLs, or renderer transcripts into tickets.
2. Revoke the suspected MCP credential and contain affected sessions or memberships through authenticated administration.
3. Review audit events, PostgreSQL authorization metadata, and private Git-volume access. Cross-tenant document, history, revert, and PDF probes must be indistinguishable as `not_found`.
4. Restore access only after containment and review.

## Git and backup incident handling

Git repositories are private source-history authority, one per company; they are never a direct download surface. Company archival retains its repository and purge is out of scope. Do not delete repository contents ad hoc.

A recovery must use PostgreSQL and the Git volume from the same consistent backup set. Preserve object storage separately for logos/styles. Document source, generated HTML, PDFs, and render records are not object-store artifacts; PDFs are rendered in memory only.

## Release gate

Run the relevant checks before release:

```sh
pnpm db:migrations:check
pnpm compose:check
pnpm check
```

Confirm TLS, runtime secrets, private storage, encrypted off-VPS backup, and a restore drill that validates PostgreSQL/Git consistency. Garage is single-node `replication_factor=1` with no redundancy; backups and restore drills are mandatory.

## Known limits

The renderer and sanitizer are defense in depth, not authorization substitutes. There is no client portal, e-signature, billing, legal/compliance certification, or self-service purge.
