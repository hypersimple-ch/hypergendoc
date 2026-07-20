"use client";
import { useState } from "react";
import type { McpAction } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";
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
  const credentials = useLoaded(dashboardApi.credentials);
  const [name, setName] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [selectedActions, setActions] = useState<McpAction[]>([
    "documents:read",
  ]);
  const [token, setToken] = useState<string>();
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState<string>();
  const owner = context?.role === "owner";
  async function create(e: React.FormEvent) {
    e.preventDefault();
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
  async function revoke(id: string) {
    if (
      !confirm(
        "Revoke this credential? It will stop working on the next request.",
      )
    )
      return;
    try {
      await dashboardApi.revokeCredential(id);
      credentials.reload();
    } catch (e) {
      setMessage(safeError(e));
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
      <section className="page-heading">
        <div>
          <p className="eyebrow">MCP access</p>
          <h1>Scoped agent access.</h1>
          <p>
            Credentials are restricted by company and action. Their secret is
            displayed only once and is never saved in this browser.
          </p>
        </div>
      </section>
      {token ? (
        <section className="panel dashboard-panel token-panel">
          <h2>Copy this secret now</h2>
          <Status kind="warning">
            This is the only time the full token will be shown.
          </Status>
          <code className="secret-token">{token}</code>
          <div className="row-actions">
            <Button onClick={() => void copy()}>Copy token</Button>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />{" "}
              I have copied it to a secret manager.
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
        <section className="panel dashboard-panel">
          <form
            className="credential-form"
            onSubmit={(event) => void create(event)}
          >
            <FormField label="Credential name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
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
            <Button type="submit" disabled={!selectedActions.length}>
              Create credential
            </Button>
          </form>
          {message && (
            <Status kind={message.includes("copied") ? "success" : "error"}>
              {message}
            </Status>
          )}
        </section>
      )}
      <section className="panel dashboard-panel">
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
                  <td>
                    {!c.revokedAt && (
                      <Button tone="danger" onClick={() => void revoke(c.id)}>
                        Revoke
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
    </>
  );
}
