"use client";
import { useRef, useState } from "react";
import type { Company } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError } from "./dashboard-state";
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Status,
  Table,
} from "./primitives";

export function CompaniesDashboard() {
  const { companies, loading, error, reload } = useActiveCompany();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (creating.current || !name.trim()) return;
    creating.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.createCompany({ name: name.trim() });
      setName("");
      reload();
    } catch (e) {
      setMessage(safeError(e));
    } finally {
      creating.current = false;
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
            Create and maintain the company records that scope this workspace’s
            styles and documents.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel company-create-panel">
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
        {message && (
          <div
            aria-live="polite"
            aria-atomic="true"
            className="mutation-feedback"
          >
            <Status kind="error">{message}</Status>
          </div>
        )}
      </section>
      <section className="panel dashboard-panel company-directory-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Workspace directory</p>
            <h2>Manage companies</h2>
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
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const pendingAction = useRef(false);
  const postArchiveFocus = useRef<HTMLButtonElement>(null);

  async function save() {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.updateCompany(company.id, { name });
      setRenaming(false);
      onChange();
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      pendingAction.current = false;
      setBusy(false);
    }
  }

  async function archive() {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.archiveCompany(company.id);
      onChange();
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      pendingAction.current = false;
      setBusy(false);
      setArchiveDialogOpen(false);
    }
  }

  async function upload(file?: File) {
    if (pendingAction.current || !file) return;
    pendingAction.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      await dashboardApi.uploadLogo(company.id, file);
      onChange();
      setMessage({ text: "Logo uploaded.", error: false });
    } catch (e) {
      setMessage({ text: safeError(e), error: true });
    } finally {
      pendingAction.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="company-record">
        <td data-label="Company">
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
            <div
              aria-live="polite"
              aria-atomic="true"
              className="mutation-feedback"
            >
              <small className={message.error ? "field-error" : undefined}>
                {message.text}
              </small>
            </div>
          )}
        </td>
        <td data-label="Status">
          <span className={`badge ${company.archivedAt ? "badge--muted" : ""}`}>
            {company.archivedAt ? "Archived" : "Active"}
          </span>
        </td>
        <td data-label="Updated">
          {new Date(company.updatedAt).toLocaleDateString()}
        </td>
        <td data-label="Actions">
          <div className="row-actions company-actions">
            {renaming ? (
              <Button tone="quiet" disabled={busy} onClick={() => void save()}>
                Save
              </Button>
            ) : (
              <Button
                ref={postArchiveFocus}
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
                onClick={() => setArchiveDialogOpen(true)}
              >
                Archive
              </Button>
            )}
          </div>
        </td>
      </tr>
      <ConfirmDialog
        open={archiveDialogOpen}
        title={`Archive ${company.name}?`}
        description="Existing documents remain available."
        confirmLabel="Archive company"
        tone="danger"
        pending={busy}
        finalFocusRef={postArchiveFocus}
        onConfirm={() => void archive()}
        onClose={() => {
          if (!busy) setArchiveDialogOpen(false);
        }}
      />
    </>
  );
}
