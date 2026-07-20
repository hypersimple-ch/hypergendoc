# Renderer threat model

## Trust boundary

Document bodies, style fields, and logos are untrusted. Sanitization reduces input surface but is not a security sandbox.

## Protected assets

- Other tenants' Git-backed document source, metadata, current PDFs, logos, and styles.
- Host/container files, credentials, sockets, processes, database, private Git volume, and object storage.
- Renderer availability and bounded resources.

## Required controls

- Require explicit `markdown` or `html`; sanitize HTML fragments and reject empty sanitized input.
- Limit source to 256 KiB and reject scripts, styles, event handlers, forms, embeds, SVG, images, unsafe URLs, external resources, and user CSS.
- Run a pinned renderer through a permissioned Unix socket with no network, no application/database/object-store secrets, non-root execution, read-only root, narrow capabilities, seccomp, and bounded resources.
- Render the current source only when PDF is requested. Keep resolved HTML and PDF bytes in memory; do not store document source, generated HTML, PDFs, or render records.
- Serve historical commit source only through authorized application routes. Never expose Git repositories directly. Mask cross-tenant access as `not_found`.
- Return safe errors without filesystem paths, command lines, raw logs, source bodies, or tokens.

## Release tests

Release evidence must cover sanitizer rejection, renderer network/host isolation, resource limits and cleanup, safe error handling, and cross-workspace/company document, commit, revert, and PDF isolation.
