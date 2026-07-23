"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Building2,
  FileText,
  KeyRound,
  Palette,
} from "lucide-react";
import { dashboardApi, type DocumentDetail } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, useLoaded } from "./dashboard-state";
import { PageHeader, Status, Table } from "./primitives";

type OverviewData = {
  documents: Awaited<ReturnType<typeof dashboardApi.documents>>;
  details: DocumentDetail[];
  credentialCount?: number | undefined;
};

async function loadOverview(
  companyId?: string,
  role?: "owner" | "member",
): Promise<OverviewData> {
  const [documents, credentials] = await Promise.all([
    companyId
      ? dashboardApi
          .documents()
          .then((items) =>
            items.filter((document) => document.companyId === companyId),
          )
      : Promise.resolve([]),
    role === "owner" ? dashboardApi.credentials() : Promise.resolve(),
  ]);
  const details = await Promise.all(
    documents.map((document) => dashboardApi.document(document.id)),
  );

  return {
    documents,
    details,
    credentialCount: credentials?.filter(
      (credential) =>
        !credential.revokedAt &&
        (!credential.expiresAt || new Date(credential.expiresAt) > new Date()),
    ).length,
  };
}

export function WorkspaceOverview() {
  const workspace = useActiveCompany();
  const overview = useLoaded(
    () => loadOverview(workspace.activeCompany?.id, workspace.context?.role),
    [workspace.activeCompany?.id, workspace.context?.role],
  );
  const loading = workspace.loading || overview.loading;
  const error = workspace.error ?? overview.error;
  const data = overview.value;
  const detailByDocumentId = new Map(
    data?.details.map((detail) => [detail.document.id, detail]),
  );
  const recentDocuments = [...(data?.documents ?? [])].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const retry = workspace.error ? workspace.reload : overview.reload;
  const companiesById = new Map(
    workspace.companies.map((company) => [company.id, company.name]),
  );

  return (
    <div className="space-y-5 text-foreground">
      <PageHeader
        eyebrow="Operations console"
        title={workspace.activeCompany?.name ?? "Workspace overview"}
        description="Scope, readiness, and document activity for the active company."
        aside={
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="/workspace/companies"
          >
            Manage companies <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <LoadState loading={loading} error={error} onRetry={retry} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <section
          aria-labelledby="scope-heading"
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Scope
              </p>
              <h2 id="scope-heading" className="mt-1 text-base font-semibold">
                Working set
              </h2>
            </div>
            <Status>Active company</Status>
          </div>
          <div className="mt-4 grid gap-2">
            <ScopeLink
              icon={Building2}
              label="Company directory (workspace-wide)"
              value={
                workspace.loading || workspace.error
                  ? undefined
                  : workspace.companies.length
              }
              detail="Current workspace-wide total"
              href="/workspace/companies"
            />
            <ScopeLink
              icon={FileText}
              label="Tracked documents (active company)"
              value={data?.documents.length}
              detail={
                workspace.activeCompany
                  ? "Current active company total"
                  : "Select a company first"
              }
              href="/workspace/documents"
            />
            <ScopeLink
              icon={Palette}
              label="Styles"
              detail={
                workspace.activeCompany
                  ? "Manage visual system"
                  : "Requires an active company"
              }
              href="/workspace/styles"
            />
          </div>
        </section>

        <section
          aria-labelledby="readiness-heading"
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Workspace readiness
            </p>
            <h2 id="readiness-heading" className="mt-1 text-base font-semibold">
              Governance queue
            </h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ReadinessAction
              icon={Palette}
              title="Review style system"
              detail={
                workspace.activeCompany
                  ? `Set the approved visual system for ${workspace.activeCompany.name}.`
                  : "Choose a company before managing its visual system."
              }
              href="/workspace/styles"
            />
            <ReadinessAction
              icon={KeyRound}
              title="Active MCP credentials (workspace-wide)"
              detail={
                workspace.context?.role === "owner"
                  ? `${data?.credentialCount ?? "—"} active · Current workspace-wide total`
                  : "Owner-managed workspace access"
              }
              href="/workspace/credentials"
            />
            <ReadinessAction
              icon={Activity}
              title="Audit workspace changes"
              detail="Review security and operational events."
              href="/workspace/audit"
            />
            <ReadinessAction
              icon={Building2}
              title="Maintain company scope"
              detail="Add, update, or archive company records."
              href="/workspace/companies"
            />
          </div>
        </section>

        <section
          aria-labelledby="recent-activity-heading"
          className="rounded-lg border border-border bg-card p-4 shadow-sm xl:col-span-2"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Recent activity
              </p>
              <h2
                id="recent-activity-heading"
                className="mt-1 text-base font-semibold"
              >
                Recently updated documents
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Status kind="success">Workspace data is up to date</Status>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/workspace/documents"
              >
                Open directory
              </Link>
            </div>
          </div>
          {workspace.noActiveCompany ? (
            <Empty>
              <strong>Select or add an active company</strong>
              <p>
                Choose an active company to review its latest document activity,
                or add a company to begin creating documents.
              </p>
            </Empty>
          ) : recentDocuments.length ? (
            <div className="mt-4">
              <Table
                caption="Recent documents"
                columns={[
                  "Document",
                  "Company",
                  "Commit",
                  "Format",
                  "Updated",
                  "Drill in",
                ]}
              >
                {recentDocuments.map((document) => {
                  const commit = detailByDocumentId.get(document.id)?.current
                    .commit;
                  return (
                    <tr key={document.id} className="hover:bg-muted/50">
                      <td>
                        <strong>{document.title}</strong>
                      </td>
                      <td>
                        {companiesById.get(document.companyId) ?? "Unavailable"}
                      </td>
                      <td className="font-mono text-xs">
                        {commit ? commit.commitSha.slice(0, 8) : "—"}
                      </td>
                      <td>{commit?.format ?? "—"}</td>
                      <td>
                        {new Date(document.updatedAt).toLocaleDateString()}
                      </td>
                      <td>
                        <Link
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                          href="/workspace/documents"
                        >
                          View history
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          ) : (
            <Empty>
              <strong>
                No documents for {workspace.activeCompany?.name} yet
              </strong>
              <p>
                Documents are created by authorized agents and retained as
                immutable commit history.
              </p>
              <Link
                className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/workspace/credentials"
              >
                Review authorized access
              </Link>
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function ScopeLink({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value?: number | undefined;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
        {value !== undefined && (
          <strong className="mt-1 block font-mono text-sm">{value}</strong>
        )}
      </span>
      <ArrowRight
        className="size-4 text-muted-foreground group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function ReadinessAction({
  icon: Icon,
  title,
  detail,
  href,
}: {
  icon: typeof Palette;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 text-primary" aria-hidden="true" />
      <span className="mt-2 flex items-center justify-between gap-2 text-sm font-medium">
        {title}
        <ArrowRight
          className="size-4 text-muted-foreground group-hover:text-primary"
          aria-hidden="true"
        />
      </span>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
        {detail}
      </span>
    </Link>
  );
}
