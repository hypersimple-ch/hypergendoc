# Security runbook

## Suspected tenant breach

1. Treat the report as an incident. Preserve timestamps, request IDs, affected workspace/credential IDs, safe error codes, and deployment version; do not copy document bodies, tokens, URLs, or renderer transcripts into tickets or logs.
2. Immediately revoke the suspected MCP credential in the owner flow. If a session or membership is implicated, contain access using the authenticated administration path and preserve the audit trail.
3. Confirm scope from audit events and trusted database/object-storage records. Cross-tenant ID probes should be indistinguishable as `not_found`; do not use probe responses as evidence of data disclosure.
4. Check private bucket policy, authenticated artifact-proxy authorization, membership changes, credential lifecycle events, and renderer/proxy configuration. Rotate affected provider credentials according to the [operations runbook](../operations/runbook.md).
5. Restore access only after containment and review. Escalate legal, customer-notification, and regulatory decisions to qualified counsel and incident leadership; this MVP makes no compliance guarantee.

## Data purge

The current dashboard supports owner-only company archival, not a complete self-service workspace/customer purge. Any destructive purge is an operator change: review tenant-scoped SQL, use guarded `deploy/prod/ops/purge-data.sh`, reconcile private objects separately, and retain approval and audit evidence. The approved replacement deployment cleanup may destructively purge pre-replacement document history and render metadata. SQL cannot delete old Garage object bytes; operators must separately identify and delete stale object bytes during that cleanup, then record what was reconciled. Do not delete raw storage objects ad hoc. Disclose that encrypted backups may retain purged data until their finite retention expires.

## Release security gate

Before any release, require the automated checks relevant to the change:

```sh
pnpm db:migrations:check
pnpm compose:check
pnpm check
```

Run renderer adversarial testing in the deployment-equivalent topology and block release on any required isolation failure. Confirm TLS, runtime-injected secrets, HTTPS for external object storage (or Garage's isolated internal `http://object-store:3900` endpoint), SMTP, private bucket access, off-VPS encrypted backups, and time synchronization. Confirm the renderer uses the pinned version-matched Playwright Chromium process over its Unix socket; has no network and aborts every browser request; runs one job and accepts at most one additional queued job; and has non-root, read-only, all capabilities dropped except the narrowly required `SYS_CHROOT`, `no-new-privileges`, and seccomp containment. The single-node Garage `replication_factor=1` deployment has no redundancy, so block release without a verified encrypted off-VPS backup and restore drill. A production Compose overlay exists, but it is not proof of these conditions; the remaining evidence gates are tracked in the [operations runbook](../operations/runbook.md).

## Known MVP limits

- The accepted document input formats are deliberately constrained. Sanitization and renderer isolation are defense in depth, not a reason to accept unsupported markup or styling.
- No client portal, e-signature, billing/financial workflow, legal review/validation/advice, generalized compliance program, or production-readiness certification is provided.
- Garage is deployed on one VPS with `replication_factor=1`, which Garage documents as test-only and non-redundant. Encrypted off-VPS backups and full restore drills are mandatory; future HA requires three nodes across three zones with RF=3.
- Guarded backup/restore and limited application-secret rotation scripts are included, but scheduling, provider credential rotation, key custody, and full restore drills remain operator responsibilities.
- Immutable history and backup retention mean deletion is not instant erasure from every backup.

See the authoritative [renderer threat model](render-threat-model.md), [permission matrix](permission-matrix.md), and [data policy](../operations/data-policy.md).
