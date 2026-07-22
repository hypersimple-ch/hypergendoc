"use client";
import { useRef, useState } from "react";
import type { McpAction } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Status,
  Table,
} from "./primitives";
const actions: McpAction[] = [
  "companies:read",
  "styles:read",
  "documents:read",
  "documents:write",
];
export function CredentialsDashboard() {
  const {
    context,
    companies,
    loading: contextLoading,
    error: contextError,
    reload,
  } = useActiveCompany();
  const credentials = useLoaded(
    () =>
      context?.role === "owner"
        ? dashboardApi.credentials()
        : Promise.resolve([]),
    [context?.role],
  );
  const [name, setName] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [selectedActions, setActions] = useState<McpAction[]>([
    "documents:read",
  ]);
  const [token, setToken] = useState<string>();
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string>();
  const [credentialToRevoke, setCredentialToRevoke] = useState<string>();
  const creatingRef = useRef(false);
  const revokingRef = useRef(false);
  const owner = context?.role === "owner";
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setMessage(undefined);
    try {
      if (!companyIds.length)
        throw new Error("Choose at least one company scope.");
      const created = await dashboardApi.createCredential({
        name,
        companyIds,
        actions: selectedActions,
      });
      setToken(created.token);
      setAck(false);
      setName("");
      credentials.reload();
    } catch (e) {
      setMessage(safeError(e));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setMessage("Token copied. Store it in your agent's secret manager.");
    } catch {
      setMessage("Copy was blocked. Select the token and copy it manually.");
    }
  }
  async function revoke() {
    if (!credentialToRevoke || revokingRef.current) return;
    revokingRef.current = true;
    setRevokingId(credentialToRevoke);
    setMessage(undefined);
    try {
      await dashboardApi.revokeCredential(credentialToRevoke);
      setMessage("Credential revoked.");
      credentials.reload();
      setCredentialToRevoke(undefined);
    } catch (e) {
      setMessage(safeError(e));
    } finally {
      revokingRef.current = false;
      setRevokingId(undefined);
    }
  }
  if (contextLoading || contextError)
    return (
      <LoadState
        loading={contextLoading}
        error={contextError}
        reload={reload}
      />
    );
  if (!owner)
    return (
      <section className="panel feature-state">
        <p className="eyebrow">MCP access</p>
        <h1>Owner access required.</h1>
        <Status kind="warning">
          Only workspace owners can view or manage MCP credentials.
        </Status>
      </section>
    );
  return (
    <>
      <section className="page-heading credentials-dashboard">
        <div>
          <p className="eyebrow">MCP access</p>
          <h1>Scoped agent access.</h1>
          <p>
            Each credential can access only the companies and MCP actions you
            select. Its secret is shown once, never stored in this browser, and
            cannot be retrieved later.
          </p>
        </div>
      </section>
      {message && (
        <div className="credentials-dashboard__announcement" aria-live="polite">
          <Status
            kind={
              message.includes("copied") || message === "Credential revoked."
                ? "success"
                : "error"
            }
          >
            {message}
          </Status>
        </div>
      )}
      {token ? (
        <section className="panel dashboard-panel token-panel credentials-dashboard__token">
          <h2>Copy this secret now</h2>
          <Status kind="warning">
            This is the only time the full token will be shown. Save it in a
            secret manager before continuing.
          </Status>
          <code className="secret-token">{token}</code>
          <div className="row-actions credentials-dashboard__token-actions">
            <Button onClick={() => void copy()}>Copy token</Button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />{" "}
              I have saved this one-time token in a secret manager.
            </label>
            <Button
              tone="quiet"
              disabled={!ack}
              onClick={() => setToken(undefined)}
            >
              Done
            </Button>
          </div>
        </section>
      ) : (
        <section className="panel dashboard-panel credentials-dashboard__create">
          <form
            className="credential-form credentials-dashboard__create-form"
            onSubmit={(event) => void create(event)}
          >
            <FormField label="Credential name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                disabled={creating}
              />
            </FormField>
            <fieldset>
              <legend>Company scopes</legend>
              {companies
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <label className="checkbox" key={c.id}>
                    <input
                      type="checkbox"
                      checked={companyIds.includes(c.id)}
                      onChange={(e) =>
                        setCompanyIds((ids) =>
                          e.target.checked
                            ? [...ids, c.id]
                            : ids.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
            </fieldset>
            <fieldset>
              <legend>Allowed actions</legend>
              {actions.map((action) => (
                <label className="checkbox" key={action}>
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(action)}
                    onChange={(e) =>
                      setActions((current) =>
                        e.target.checked
                          ? [...current, action]
                          : current.filter((a) => a !== action),
                      )
                    }
                  />
                  {action}
                </label>
              ))}
            </fieldset>
            <Button
              type="submit"
              disabled={creating || !selectedActions.length}
            >
              {creating ? "Creating…" : "Create credential"}
            </Button>
          </form>
        </section>
      )}
      <section className="panel dashboard-panel credentials-dashboard__list">
        <h2>Credentials</h2>
        <LoadState {...credentials} />
        {credentials.value &&
          (credentials.value.length ? (
            <Table
              caption="MCP credentials"
              columns={["Credential", "Scopes", "Last used", "State", "Action"]}
            >
              {credentials.value.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <small className="subtle">{c.prefix}…</small>
                  </td>
                  <td>
                    {c.companyIds.length} companies · {c.actions.join(", ")}
                  </td>
                  <td>
                    {c.lastUsedAt
                      ? new Date(c.lastUsedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td>
                    {c.revokedAt ? (
                      <span className="badge badge--muted">Revoked</span>
                    ) : (
                      <span className="badge">Active</span>
                    )}
                  </td>
                  <td className="credentials-dashboard__actions">
                    {!c.revokedAt && (
                      <Button
                        tone="danger"
                        disabled={revokingId === c.id}
                        onClick={() => setCredentialToRevoke(c.id)}
                      >
                        {revokingId === c.id ? "Revoking…" : "Revoke"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>
              <strong>No credentials yet</strong>
              <p>Create a narrowly scoped credential for an agent.</p>
            </Empty>
          ))}
      </section>
      <ConfirmDialog
        open={Boolean(credentialToRevoke)}
        title="Revoke credential?"
        description="This credential will stop working on its next request. This cannot be undone."
        confirmLabel="Revoke credential"
        pending={Boolean(revokingId)}
        tone="danger"
        onConfirm={() => void revoke()}
        onClose={() => {
          if (!revokingId) setCredentialToRevoke(undefined);
        }}
      />
    </>
  );
}
