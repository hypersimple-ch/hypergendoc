# Executable MVP acceptance scenarios

These scenarios are release gates and must be automated where possible.

## Complete agent flow

1. Register and verify an owner account.
2. Create workspace `Agency A`, invite a member, and create companies `Client A1` and `Client A2`.
3. Upload a valid logo and create/activate a structured proposal style for `Client A1`.
4. Issue a credential with `companies:read`, `styles:read`, `documents:read`, and `documents:write`, scoped only to `Client A1`; capture plaintext once.
5. Initialize MCP, list companies/styles, and confirm `Client A2` is absent.
6. Create a proposal using the documented body subset. Confirm a ready PDF, immutable version 1, exact style-version reference, hashes, actor, and renderer version.
7. Review and download the private PDF/source in the dashboard as owner and member.
8. Create version 2 through MCP. Confirm version 1 remains unchanged and version 2 inherits the prior exact style version.
9. Create/activate a newer style. Create version 3 without a style override and confirm it still inherits version 2's style; explicitly select the new active style for version 4 and confirm the change is recorded.
10. Revoke the credential and confirm its next MCP request is unauthorized.

## Tenant and role isolation

- Create `Agency B` with similarly shaped data. Sessions and credentials from either workspace cannot list, infer, mutate, download, or delete data from the other, including by direct UUID.
- A member can manage companies/styles and review documents but cannot invite/change members, issue/revoke credentials, view owner audit data, delete workspace data, or promote themselves.
- Unknown and cross-tenant IDs return indistinguishable not-found responses.
- Private object keys cannot be fetched anonymously or with expired/replayed authorization.

## Renderer safety

Run the adversarial corpus in the exact production Compose topology. Prove no shell execution, network access, host or sibling-job file access, socket access, secret exposure, unbounded process creation, resource-limit bypass, persistent artifact, or raw diagnostic leakage. A timeout kills descendants and leaves the daemon healthy for the next valid job.

## Reliability and operations

- Concurrent revisions allocate unique monotonic versions and maintain a valid current pointer.
- Database/Garage/render failures produce safe status and do not expose partial artifacts as current.
- Verify the Garage default bucket with the pinned AWS CLI image, confirm S3 access at `http://object-store:3900` in region `garage`, and confirm its internal admin health endpoint responds at `GET http://object-store:3903/health` without publishing any Garage ports.
- Restart each service during bounded traffic; committed versions remain readable and pending/failed work reconciles deterministically.
- Deploy to a clean VPS-equivalent host, migrate forward, run the full flow over TLS, create an encrypted off-VPS backup, destroy test data, restore, and repeat read/revision checks. This is a release blocker because the single-node Garage `replication_factor=1` topology has no redundancy; retain both Garage metadata and data volumes during the drill.

## Quality gates

Formatting, linting, strict type checking, unit/integration/contract/MCP/browser/security/renderer/load tests, migrations, production builds, dependency audit, image scan, and Compose security assertions all pass from a clean checkout.
