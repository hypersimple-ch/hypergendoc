"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Building2, Plus, Upload } from "lucide-react";
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

type StatusFilter = "all" | "active" | "archived";

export function CompaniesDashboard() {
  const { companies, activeCompany, loading, error, reload } =
    useActiveCompany();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const creating = useRef(false);
  const visibleCompanies = useMemo(
    () =>
      companies.filter(
        (company) =>
          company.name.toLowerCase().includes(query.toLowerCase()) &&
          (statusFilter === "all" ||
            (statusFilter === "archived"
              ? Boolean(company.archivedAt)
              : !company.archivedAt)),
      ),
    [companies, query, statusFilter],
  );

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
    <div className="mx-auto max-w-7xl space-y-5 text-foreground">
      <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Operations console
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Companies
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Maintain the company scope used by workspace styles and documents.
          </p>
        </div>
        <Status>
          {companies.length} {companies.length === 1 ? "record" : "records"}
        </Status>
      </header>

      <section
        aria-labelledby="add-company-heading"
        className="rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2">
          <Plus className="size-4 text-primary" aria-hidden="true" />
          <h2 id="add-company-heading" className="text-sm font-semibold">
            Add company
          </h2>
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => void create(event)}
        >
          <div className="min-w-0 flex-1">
            <FormField label="Company name">
              <Input
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </FormField>
          </div>
          <Button type="submit" disabled={busy}>
            <Plus className="size-4" aria-hidden="true" />
            {busy ? "Creating…" : "Add company"}
          </Button>
        </form>
        {message && (
          <div aria-live="polite" aria-atomic="true" className="mt-3">
            <Status kind="error">{message}</Status>
          </div>
        )}
      </section>

      <section
        aria-labelledby="company-directory-heading"
        className="rounded-lg border border-border bg-card shadow-sm"
      >
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Directory
            </p>
            <h2
              id="company-directory-heading"
              className="mt-1 text-base font-semibold"
            >
              Manage companies
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[32rem]">
            <FormField label="Search companies">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name"
              />
            </FormField>
            <FormField label="Record status">
              <select
                className="input h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="all">All records</option>
                <option value="active">Active only</option>
                <option value="archived">Archived only</option>
              </select>
            </FormField>
          </div>
        </div>
        <div className="p-4">
          <LoadState loading={loading} error={error} reload={reload} />
          {!loading &&
            !error &&
            (visibleCompanies.length ? (
              <Table
                caption="Companies"
                columns={["Company", "Status", "Updated", "Actions"]}
              >
                {visibleCompanies.map((company) => (
                  <CompanyRow
                    company={company}
                    key={company.id}
                    active={activeCompany?.id === company.id}
                    onChange={reload}
                  />
                ))}
              </Table>
            ) : companies.length ? (
              <Empty>
                <strong>No matching companies</strong>
                <p>Adjust the search or status filter to see another record.</p>
                <Button
                  tone="quiet"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </Empty>
            ) : (
              <Empty>
                <strong>No companies yet</strong>
                <p>Add a company to start defining its visual system.</p>
              </Empty>
            ))}
        </div>
      </section>
    </div>
  );
}

function CompanyRow({
  company,
  active,
  onChange,
}: {
  company: Company;
  active: boolean;
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
      <tr className="hover:bg-muted/50">
        <td data-label="Company">
          <div className="flex flex-wrap items-center gap-2">
            {renaming ? (
              <Input
                aria-label={`Rename ${company.name}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            ) : (
              <>
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                <strong className="min-w-0 break-words">{company.name}</strong>
              </>
            )}
            {active && (
              <span className="shrink-0 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                Active scope
              </span>
            )}
          </div>
          {message && (
            <div aria-live="polite" aria-atomic="true" className="mt-2">
              <small className={message.error ? "field-error" : "text-success"}>
                {message.text}
              </small>
            </div>
          )}
        </td>
        <td data-label="Status">
          <span
            className={
              company.archivedAt
                ? "rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                : "rounded bg-success-soft px-2 py-1 text-xs font-medium text-success"
            }
          >
            {company.archivedAt ? "Archived" : "Active"}
          </span>
        </td>
        <td data-label="Updated" className="text-sm text-muted-foreground">
          {new Date(company.updatedAt).toLocaleDateString()}
        </td>
        <td data-label="Actions">
          <div className="flex flex-wrap gap-2">
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
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
              <Upload className="size-3.5" aria-hidden="true" />
              Upload logo
              <input
                className="sr-only"
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
                <Archive className="size-3.5" aria-hidden="true" />
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
