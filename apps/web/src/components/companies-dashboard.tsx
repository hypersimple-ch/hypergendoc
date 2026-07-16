"use client";
import { useState } from "react";
import type { Company } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";

export function CompaniesDashboard() {
  const data = useLoaded(dashboardApi.companies);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.createCompany({ name: name.trim() });
      setName("");
      data.reload();
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
          <Button disabled={busy}>{busy ? "Creating…" : "Add company"}</Button>
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
        <LoadState {...data} />
        {data.value &&
          (data.value.length ? (
            <Table
              caption="Companies"
              columns={["Company", "Status", "Updated", "Actions"]}
            >
              {data.value.map((company) => (
                <CompanyRow
                  company={company}
                  key={company.id}
                  onChange={data.reload}
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
  const [message, setMessage] = useState<string>();
  async function save() {
    try {
      await dashboardApi.updateCompany(company.id, { name });
      setRenaming(false);
      onChange();
    } catch (e) {
      setMessage(safeError(e));
    }
  }
  async function archive() {
    if (
      !confirm(`Archive ${company.name}? Existing documents remain available.`)
    )
      return;
    try {
      await dashboardApi.archiveCompany(company.id);
      onChange();
    } catch (e) {
      setMessage(safeError(e));
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    try {
      await dashboardApi.uploadLogo(company.id, file);
      setMessage("Logo uploaded.");
    } catch (e) {
      setMessage(safeError(e));
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
        {message && <small className="field-error">{message}</small>}
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
            <Button tone="quiet" onClick={() => void save()}>
              Save
            </Button>
          ) : (
            <Button tone="quiet" onClick={() => setRenaming(true)}>
              Rename
            </Button>
          )}
          <label className="button button--quiet">
            Upload logo
            <input
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          {!company.archivedAt && (
            <Button tone="danger" onClick={() => void archive()}>
              Archive
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
