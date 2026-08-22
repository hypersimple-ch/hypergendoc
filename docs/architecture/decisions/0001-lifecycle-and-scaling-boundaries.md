# ADR 0001: Lifecycle and horizontal-scaling boundaries

- Status: Accepted
- Date: 2026-08-22

## Context

Company archive and restore are implemented product operations. The database also contains reserved `archived_at` columns for styles and templates, but the application has no style/template archive or restore command. Returning those fields in public contracts implied a lifecycle that clients could observe but never control.

Authentication and MCP rate limits are currently stored in one server process. This is deterministic only while one server replica handles the public API.

## Decision

1. Style and template archive state remains an internal, reserved database detail. `Style` and `Template` public contracts do not expose `archivedAt` until archive and restore commands, authorization, audit events, UI, and retention behavior are designed and implemented together. The columns remain in the database so a later migration does not need to recreate historical storage.
2. HyperGenDoc production supports exactly one `server` replica while rate limiting is process-local. Operators must not scale the server horizontally.
3. Before a second server replica is allowed, rate-limit counters must move behind a shared atomic store. The change must preserve credential/IP keys, expiry windows, failure behavior, and regression tests across two server instances.

## Consequences

- Clients cannot infer unsupported Style/Template lifecycle operations from response fields.
- Company lifecycle remains unchanged.
- Single-node production has an explicit scaling guard rather than silently weakening rate limits.
- A future lifecycle proposal requires a new ADR and complete API/UI/audit semantics.
