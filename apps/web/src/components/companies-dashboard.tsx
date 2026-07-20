"use client";
import { useState } from "react";
import type { Company } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";

export function CompaniesDashboard() {
  const { companies, loading, error, reload } = useActiveCompany();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.createCompany({ name: name.trim() });
      setName("");
      reload();
    } catch (e) {
      setMessage(safeError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Companies</p>
          <h1>Brand homes.</h1>
          <p>
            Create and maintain the companies whose styles and documents live in
            this workspace.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel">
        <form className="inline-form" onSubmit={(event) => void create(event)}>
          <FormField label="Company name">
            <Input
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Add company"}
          </Button>
        </form>
        {message && <Status kind="error">{message}</Status>}
      </section>
      <section className="panel dashboard-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>Companies</h2>
          </div>
        </div>
        <LoadState loading={loading} error={error} reload={reload} />
        {!loading &&
          !error &&
          (companies.length ? (
            <Table
              caption="Companies"
              columns={["Company", "Status", "Updated", "Actions"]}
            >
              {companies.map((company) => (
                <CompanyRow
                  company={company}
                  key={company.id}
                  onChange={reload}
                />
              ))}
            </Table>
          ) : (
            <Empty>
              <strong>No companies yet</strong>
              <p>Add a company to start defining its visual system.</p>
            </Empty>
          ))}
      </section>
    </>
  );
}
function CompanyRow({
  company,
  onChange,
}: {
  company: Company;
  onChange: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(company.name);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.updateCompany(company.id, { name });
      setRenaming(false);
      onChange();
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (
      busy ||
      !confirm(`Archive ${company.name}? Existing documents remain available.`)
    )
      return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.archiveCompany(company.id);
      onChange();
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (busy || !file) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.uploadLogo(company.id, file);
      onChange();
      setMessage({ text: "Logo uploaded.", error: false });
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>
        {renaming ? (
          <Input
            aria-label={`Rename ${company.name}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <strong>{company.name}</strong>
        )}
        {message && (
          <small className={message.error ? "field-error" : undefined}>
            {message.text}
          </small>
        )}
      </td>
      <td>
        <span className={`badge ${company.archivedAt ? "badge--muted" : ""}`}>
          {company.archivedAt ? "Archived" : "Active"}
        </span>
      </td>
      <td>{new Date(company.updatedAt).toLocaleDateString()}</td>
      <td>
        <div className="row-actions">
          {renaming ? (
            <Button tone="quiet" disabled={busy} onClick={() => void save()}>
              Save
            </Button>
          ) : (
            <Button
              tone="quiet"
              disabled={busy}
              onClick={() => setRenaming(true)}
            >
              Rename
            </Button>
          )}
          <label className="button button--quiet">
            Upload logo
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          {!company.archivedAt && (
            <Button
              tone="danger"
              disabled={busy}
              onClick={() => void archive()}
            >
              Archive
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
