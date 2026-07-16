# Renderer threat model

## Trust boundary

All agent-supplied document bodies are hostile, even when submitted with a valid credential. Style fields and uploaded logos are also untrusted. The validator reduces the language surface but is not a security sandbox.

## Protected assets

- Other tenants' source, PDFs, logos, metadata, and render jobs.
- Host and container files, environment variables, sockets, processes, and credentials.
- Application database/object storage and VPS control plane.
- Renderer availability and bounded CPU, memory, disk, process, page, and wall-clock usage.

## Required controls

### Language boundary

- Parse a documented content grammar; reject rather than pass through unknown commands/environments.
- Server owns the class, preamble, packages, macro definitions, file paths, and style implementation.
- Reject preambles, package loading, macro/category-code mutation, file and pipe primitives, shell primitives, dynamic control-sequence construction, external URLs, embedded files, and unsupported encodings.
- Bound bytes, nesting, nodes, table dimensions, URL length, and expansion work before compilation.

### Process boundary

- Dedicated non-root renderer image pinned by digest/version.
- `network_mode: none`; IPC only through a permissioned Unix socket.
- No database, object-store, SMTP, application, cloud, or TLS secrets.
- No Docker/Podman socket, host path, device, or privileged mode.
- Read-only root, dropped Linux capabilities, `no-new-privileges`, restrictive seccomp/AppArmor where available, bounded PIDs/CPU/memory, and per-job tmpfs.
- TeX shell escape disabled and restrictive `openin_any`/`openout_any` policy.
- Each job receives only its normalized body and resolved style assets. Sibling jobs are not mounted or persisted.
- Kill the process tree on timeout/output limit and remove the workspace regardless of outcome.

### Output boundary

- Accept only a regular PDF below the output limit.
- Hash and store the exact resolved source and PDF through the application server after authorization.
- Return stable safe error codes; do not expose filesystem paths, command lines, package inventory, or raw logs.

## Threats and release tests

| Threat                  | Mandatory evidence                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Shell/command execution | Shell primitives and escape variants rejected; marker command never runs.                                              |
| File read/write         | Host paths, `/proc`, environment, TeX files, socket, and traversal cannot be read or written.                          |
| Network access          | DNS, loopback, link-local, private, and public probes fail in production Compose.                                      |
| Cross-job access        | A malicious concurrent job cannot identify or read sibling input/output.                                               |
| Resource exhaustion     | Recursive expansion, huge tables, page floods, fork attempts, and oversized output hit enforced limits and clean up.   |
| Parser bypass           | Mixed case, comments, encodings, dynamically formed commands, malformed braces, and nested constructs remain rejected. |
| Supply-chain drift      | Renderer image, TeX distribution, fonts, wrapper, and output metadata are versioned and pinned.                        |
| Error leakage           | API/MCP errors and logs contain no source body, token, path, secret, or raw compiler transcript.                       |

A production release is blocked if any mandatory isolation test fails. When parsing safety is uncertain, narrow the accepted grammar; never compensate by granting the renderer more access.
