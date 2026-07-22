# Repository Agent Instructions

## Local browser audits

- Use the local Compose entry point at `http://localhost:8080`. Never use production accounts, credentials, or data for browser audits.
- The parent agent must provision a disposable, verified local account and workspace before routine authenticated audits. Give each `webapp-auditor` a self-contained handoff containing the local URL, disposable credentials, target routes, stop conditions, and the interaction protocol below. Do not ask routine auditors to register independently.
- Subagents have no conversation context. Repeat the critical browser instructions in every handoff even though this file is repository-visible.
- For every control near or below the fold: capture a current interactive snapshot, run `scrollintoview` on its current `@ref`, click that exact ref, then verify the expected network request, URL, or visible state. A tool response saying `clicked` is not proof that the native event or submission occurred.
- After navigation or rerendering, capture a new snapshot before using refs again. Do not use JavaScript `element.click()` as final evidence.
- For registration-specific testing only, use a fresh disposable `@example.test` account. Confirm both `POST /api/auth/sign-up/email` and the visible success message before continuing. Follow the local verification and setup pattern in [`archive/e2e/tests/browser/dashboard-flow.spec.ts`](archive/e2e/tests/browser/dashboard-flow.spec.ts).
- Confirm authenticated access through the relevant protected routes: `/workspace`, `/workspace/companies`, `/workspace/documents`, `/workspace/styles`, `/workspace/members`, `/workspace/credentials`, and `/workspace/audit`.
- Never store or report passwords, session cookies, credential secrets, or MCP tokens. Disposable credentials belong only in the private runtime handoff.
- Stop before destructive actions, external submissions, credential creation, or other product-data mutations unless the task explicitly authorizes them.
