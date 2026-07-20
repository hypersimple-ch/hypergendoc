# Renderer threat model

## Trust boundary

All agent-supplied document bodies are hostile, even when submitted with a valid credential. Style fields and uploaded logos are also untrusted. Sanitization reduces the input surface but is not a security sandbox.

## Protected assets

- Other tenants' original inputs, PDFs, logos, metadata, private render evidence, and render jobs.
- Host and container files, environment variables, sockets, processes, and credentials.
- Application database/object storage and VPS control plane.
- Renderer availability and bounded CPU, memory, disk, process, page, and wall-clock usage.

## Required controls

### Input boundary

- Every immutable version has an explicit `"markdown"` or `"html"` format; the original exact body and format are retained and identity-hashed together.
- Markdown is treated as text input. HTML is sanitized as a fragment; empty sanitized input is rejected.
- The conservative HTML allow-list retains semantic headings, paragraphs, emphasis, lists, blockquotes, code/preformatted blocks, links restricted to safe protocols, and tables.
- Remove scripts, styles, event handlers, forms, iframes, objects, embeds, SVG, images, arbitrary attributes/classes/IDs, inline CSS, protocol-relative/file/local/unsafe URLs, and external resources.
- Bound input to 256 KiB UTF-8 before rendering.
- Structured server-owned style fields generate all CSS, page layout, headers, footers, and page-number layout. No user-authored CSS or style layer is accepted.

### Process boundary

- Use a pinned, version-matched Playwright Chromium renderer reached only through a permissioned Unix socket.
- One render job runs at a time and at most one additional job is queued. Each job uses a fresh browser and context; its browser server is forcibly terminated regardless of outcome.
- Network access is disabled; every browser request is aborted.
- The renderer has no database, object-store, SMTP, application, cloud, or TLS secrets.
- No Docker/Podman socket, host path, device, or privileged mode is available.
- The renderer runs non-root with a read-only root filesystem, all Linux capabilities dropped except the narrowly required `SYS_CHROOT`, `no-new-privileges`, seccomp sandbox containment, and bounded PIDs/CPU/memory.
- Kill rendering on timeout, page limit, or output limit and remove per-job state regardless of outcome.

### Output boundary

- Render deterministic fully styled HTML only as private render evidence (`text/html`); it is not the original input and never a client download surface.
- Accept only a PDF below 25 MiB, within 30 seconds and 100 pages. Verify its `%PDF-` signature and hash before storage.
- The submitted input download is a private `text/plain; charset=utf-8` attachment named `.md` or `.html`; PDFs are private authorized artifacts.
- Return stable safe error codes; do not expose filesystem paths, command lines, browser internals, or raw logs.

## Threats and release tests

| Threat               | Mandatory evidence                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Active HTML          | Disallowed elements, attributes, unsafe links, and external-resource attempts are removed or rejected.     |
| Browser network      | Every browser request is aborted; DNS, loopback, link-local, private, and public probes cannot succeed.    |
| Host access          | Host paths, `/proc`, environment, sockets, and traversal cannot be read or written.                        |
| Cross-job access     | A malicious concurrent submission cannot identify or read sibling input/output.                            |
| Resource exhaustion  | Oversized input/output, page floods, and slow jobs hit enforced limits and clean up.                       |
| Renderer containment | Non-root, read-only, narrow capability allow-list, `no-new-privileges`, and seccomp controls are active.   |
| Supply-chain drift   | Playwright and Chromium versions are matched and pinned; renderer image and output metadata are versioned. |
| Error leakage        | API/MCP errors and logs contain no input body, token, path, secret, or raw renderer transcript.            |

A production release is blocked if any mandatory isolation test fails. When sanitizer safety is uncertain, narrow the accepted HTML surface; never compensate by granting the renderer more access.
