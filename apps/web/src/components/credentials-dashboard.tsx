"use client";

import { useRef, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import type { McpAction, McpCredential } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  PageHeader,
  Status,
  Table,
} from "./primitives";

const actions: McpAction[] = [
  "companies:read",
  "styles:read",
  "templates:read",
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
  const [expiresAt, setExpiresAt] = useState("");
  const [token, setToken] = useState<string>();
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string>();
  const [credentialToRevoke, setCredentialToRevoke] = useState<string>();
  const creatingRef = useRef(false);
  const revokingRef = useRef(false);
  const owner = context?.role === "owner";
  const activeCredentials = credentials.value?.filter(
    (credential) =>
      !credential.revokedAt &&
      (!credential.expiresAt || new Date(credential.expiresAt) > new Date()),
  ).length;

  async function create(event: React.FormEvent) {
    event.preventDefault();
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
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      setToken(created.token);
      setAck(false);
      setName("");
      setExpiresAt("");
      credentials.reload();
    } catch (error) {
      setMessage(safeError(error));
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
    } catch (error) {
      setMessage(safeError(error));
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
      <section className="panel feature-state border border-border bg-card p-5">
        <div className="flex gap-3">
          <LockKeyhole
            className="mt-0.5 size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="eyebrow">Governance / MCP access</p>
            <h1 className="mt-1">Owner access required.</h1>
            <Status kind="warning">
              Only workspace owners can view or manage MCP credentials.
            </Status>
          </div>
        </div>
      </section>
    );

  return (
    <>
      <PageHeader
        eyebrow="Governance / MCP access"
        title="Scoped agent access"
        description="Issue narrowly scoped credentials for MCP agents. Secrets are shown once and cannot be retrieved later."
        aside={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Owner-managed credentials
          </div>
        }
      />

      <section
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"
        aria-label="Credential access summary"
      >
        <SummaryCard
          icon={<KeyRound className="size-4" />}
          label="Active credentials"
          value={activeCredentials ?? "—"}
        />
        <SummaryCard
          icon={<ShieldCheck className="size-4" />}
          label="Selected company scopes"
          value={companyIds.length}
        />
        <SummaryCard
          icon={<LockKeyhole className="size-4" />}
          label="One-time secret reveal"
          value="Enabled"
        />
      </section>

      {message && (
        <div
          className="mutation-feedback"
          aria-live="polite"
          aria-atomic="true"
        >
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
        <section
          className="panel dashboard-panel border border-warning/30 bg-card p-4 sm:p-5"
          aria-labelledby="credential-token-title"
          aria-describedby="credential-token-description"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 self-start rounded-md bg-warning-soft p-2 text-warning">
              <LockKeyhole className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="eyebrow">Secret handling</p>
              <h2
                id="credential-token-title"
                className="mt-1 text-base font-semibold"
              >
                Copy this secret now
              </h2>
              <p
                id="credential-token-description"
                className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground"
              >
                This is the only time the full token will be shown. Save it in a
                secret manager before continuing.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <code className="secret-token block min-w-0 select-all overflow-x-auto font-mono text-base">
              {token}
            </code>
            <Button className="text-base" onClick={() => void copy()}>
              Copy token
            </Button>
          </div>
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <label className="checkbox text-sm leading-5">
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />{" "}
              I have saved this one-time token in a secret manager.
            </label>
            <Button disabled={!ack} onClick={() => setToken(undefined)}>
              Done
            </Button>
          </div>
        </section>
      ) : (
        <section className="panel dashboard-panel max-w-4xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="shrink-0 self-start rounded-md bg-accent p-2 text-accent-foreground">
              <KeyRound className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">New credential</p>
              <h2 className="text-base font-semibold">
                Define the access boundary
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Limit each agent to the companies and actions it needs.
              </p>
            </div>
          </div>
          <form className="grid gap-5" onSubmit={(event) => void create(event)}>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Credential name">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={120}
                  disabled={creating}
                />
              </FormField>
              <FormField
                label="Expires (optional)"
                hint="Uses your local time."
              >
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  disabled={creating}
                />
              </FormField>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <fieldset className="rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-medium">
                  Company scopes
                </legend>
                <p className="mb-3 text-sm text-muted-foreground">
                  Select the companies this credential may access.
                </p>
                <div className="grid gap-2">
                  {companies
                    .filter((company) => !company.archivedAt)
                    .map((company) => (
                      <label className="checkbox" key={company.id}>
                        <input
                          type="checkbox"
                          checked={companyIds.includes(company.id)}
                          onChange={(event) =>
                            setCompanyIds((ids) =>
                              event.target.checked
                                ? [...ids, company.id]
                                : ids.filter((id) => id !== company.id),
                            )
                          }
                        />
                        {company.name}
                      </label>
                    ))}
                </div>
              </fieldset>
              <fieldset className="rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-medium">
                  Allowed actions
                </legend>
                <p className="mb-3 text-sm text-muted-foreground">
                  Grant only the MCP actions this agent requires.
                </p>
                <div className="grid gap-2">
                  {actions.map((action) => (
                    <label className="checkbox font-mono text-sm" key={action}>
                      <input
                        type="checkbox"
                        checked={selectedActions.includes(action)}
                        onChange={(event) =>
                          setActions((current) =>
                            event.target.checked
                              ? [...current, action]
                              : current.filter(
                                  (selected) => selected !== action,
                                ),
                          )
                        }
                      />
                      {action}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                The full token is never stored in this browser.
              </p>
              <Button
                type="submit"
                disabled={creating || !selectedActions.length}
              >
                {creating ? "Creating…" : "Create credential"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Credential register</p>
            <h2 className="text-base font-semibold">Credentials</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Revocation takes effect on the next request.
          </p>
        </div>
        <LoadState {...credentials} />
        {credentials.value &&
          (credentials.value.length ? (
            <Table
              caption="MCP credentials"
              columns={["Credential", "Scopes", "Last used", "State", "Action"]}
            >
              {credentials.value.map((credential) => (
                <CredentialRow
                  key={credential.id}
                  credential={credential}
                  companies={companies}
                  revoking={revokingId === credential.id}
                  onRevoke={() => setCredentialToRevoke(credential.id)}
                  onUpdated={credentials.reload}
                />
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

function CredentialRow({
  credential,
  companies,
  revoking,
  onRevoke,
  onUpdated,
}: {
  credential: McpCredential;
  companies: { id: string; name: string; archivedAt: string | null }[];
  revoking: boolean;
  onRevoke: () => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [companyIds, setCompanyIds] = useState([...credential.companyIds]);
  const [selectedActions, setSelectedActions] = useState<McpAction[]>([
    ...credential.actions,
  ]);
  const [expiresAt, setExpiresAt] = useState(
    credential.expiresAt
      ? new Date(
          new Date(credential.expiresAt).getTime() -
            new Date(credential.expiresAt).getTimezoneOffset() * 60_000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const expired = Boolean(
    credential.expiresAt && new Date(credential.expiresAt) <= new Date(),
  );

  async function save() {
    if (saving || !companyIds.length || !selectedActions.length) return;
    setSaving(true);
    setMessage(undefined);
    try {
      await dashboardApi.updateCredential(credential.id, {
        companyIds,
        actions: selectedActions,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setEditing(false);
      setMessage("Credential updated.");
      onUpdated();
    } catch (error) {
      setMessage(safeError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <div className="flex flex-col gap-0.5">
          <strong>{credential.name}</strong>
          <small className="font-mono text-muted-foreground">
            {credential.prefix}…
          </small>
          {message && <small aria-live="polite">{message}</small>}
        </div>
      </td>
      <td>
        {editing ? (
          <div className="grid gap-3">
            <fieldset>
              <legend className="text-xs font-medium">Company scopes</legend>
              {companies
                .filter((company) => !company.archivedAt)
                .map((company) => (
                  <label className="checkbox" key={company.id}>
                    <input
                      type="checkbox"
                      checked={companyIds.includes(company.id)}
                      onChange={(event) =>
                        setCompanyIds((current) =>
                          event.target.checked
                            ? [...current, company.id]
                            : current.filter((id) => id !== company.id),
                        )
                      }
                    />
                    {company.name}
                  </label>
                ))}
            </fieldset>
            <fieldset>
              <legend className="text-xs font-medium">Allowed actions</legend>
              {actions.map((action) => (
                <label className="checkbox font-mono text-xs" key={action}>
                  <input
                    type="checkbox"
                    checked={selectedActions.includes(action)}
                    onChange={(event) =>
                      setSelectedActions((current) =>
                        event.target.checked
                          ? [...current, action]
                          : current.filter((item) => item !== action),
                      )
                    }
                  />
                  {action}
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <>
            {credential.companyIds.length} companies ·{" "}
            {credential.actions.join(", ")}
          </>
        )}
      </td>
      <td>
        {credential.lastUsedAt
          ? new Date(credential.lastUsedAt).toLocaleString()
          : "Never"}
      </td>
      <td>
        {editing ? (
          <FormField label="Expires" hint="Leave blank for no expiry.">
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </FormField>
        ) : (
          <div className="flex flex-col gap-1">
            {credential.revokedAt ? (
              <span className="badge badge--muted">Revoked</span>
            ) : expired ? (
              <span className="badge badge--muted">Expired</span>
            ) : (
              <span className="badge">Active</span>
            )}
            <small className="text-muted-foreground">
              {credential.expiresAt
                ? `Expires ${new Date(credential.expiresAt).toLocaleString()}`
                : "No expiry"}
            </small>
          </div>
        )}
      </td>
      <td>
        {!credential.revokedAt &&
          (editing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  saving || !companyIds.length || !selectedActions.length
                }
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                tone="quiet"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button tone="quiet" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button tone="danger" disabled={revoking} onClick={onRevoke}>
                {revoking ? "Revoking…" : "Revoke"}
              </Button>
            </div>
          ))}
      </td>
    </tr>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 last:col-span-2 sm:px-4 sm:py-3 sm:last:col-span-1">
      <div className="flex items-center gap-2 text-xs font-medium uppercase leading-4 tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold text-foreground sm:mt-2">
        {value}
      </p>
    </div>
  );
}
