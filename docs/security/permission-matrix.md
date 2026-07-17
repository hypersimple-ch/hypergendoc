# Authorization policy

## Human roles

Roles are workspace-scoped. The first registered user creates a workspace as its owner. A workspace must retain at least one owner.

| Capability                                       | Owner | Member |
| ------------------------------------------------ | :---: | :----: |
| Read workspace and membership list               |  Yes  |  Yes   |
| Change workspace settings                        |  Yes  |   No   |
| Invite, remove, or change member roles           |  Yes  |   No   |
| Create, read, and update companies               |  Yes  |  Yes   |
| Archive companies                                |  Yes  |   No   |
| Create style versions and activate styles        |  Yes  |  Yes   |
| Read documents, versions, source, and PDFs       |  Yes  |  Yes   |
| Delete documents/company data                    |  Yes  |   No   |
| Create, scope, rotate, or revoke MCP credentials |  Yes  |   No   |
| Read audit events                                |  Yes  |   No   |

Every request resolves the workspace from the authenticated membership. A caller cannot select a workspace merely by sending its ID. Cross-workspace identifiers produce `not_found` rather than disclosing existence.

## MCP actions

| Scope             | Permitted operations                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `companies:read`  | List/read only companies in the credential company allow-list.                         |
| `styles:read`     | List/read active styles and versions for allowed companies.                            |
| `documents:read`  | List/read documents, versions, source, and authorized downloads for allowed companies. |
| `documents:write` | Create documents and immutable document versions for allowed companies.                |

A request must pass all checks: credential exists, hash matches, not revoked/expired, action is present, company is allow-listed, target resolves inside the credential workspace, and rate limit permits it. Style mutation is not exposed over MCP in the MVP.

## Actor context

Authoritative services receive one of:

```text
HumanActor { userId, workspaceId, membershipId, role, requestId }
AgentActor { credentialId, workspaceId, allowedCompanyIds, actions, requestId }
```

The transport constructs this context after authentication. Domain services enforce it. Data repositories still require the trusted workspace ID in every query as defense in depth.

## Credential handling

- Generate at least 256 bits of randomness.
- Format: non-secret product prefix, short lookup prefix, and secret segment.
- Store the lookup prefix, a slow keyed/cryptographic hash of the complete token, scopes, timestamps, and revocation state.
- Display plaintext only in the successful creation response and never persist or log it.
- Require HTTPS. Return generic unauthorized errors for unknown, malformed, or revoked credentials.
- Revocation applies to the next request; no authorization cache may outlive revocation.

## Audit events

Audit owner/member changes, company/style changes, credential lifecycle, document creation/versioning/deletion, source/PDF access, login security events, and administrative data purge. Never include passwords, tokens, document bodies, signed URLs, or reset links.
