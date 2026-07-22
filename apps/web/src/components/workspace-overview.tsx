"use client";

import Link from "next/link";
import { dashboardApi, type DocumentDetail } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, useLoaded } from "./dashboard-state";
import { Status, Table } from "./primitives";

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
  const companiesById = new Map(
    workspace.companies.map((company) => [company.id, company.name]),
  );
  const retry = workspace.error ? workspace.reload : overview.reload;

  return (
    <div className="workspace-overview">
      <section className="page-heading workspace-overview__heading">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>{workspace.activeCompany?.name ?? "Your document desk"}</h1>
          <p>
            Review the latest documents for your active company, then manage its
            visual system before authorized agents create the next version.
          </p>
        </div>
        <Link className="button button--primary" href="/workspace/companies">
          Manage companies
        </Link>
      </section>
      <section
        className="metric-grid workspace-overview__metrics"
        aria-label="Workspace status"
      >
        <Metric
          label="Company directory (workspace-wide)"
          value={
            workspace.loading || workspace.error
              ? undefined
              : workspace.companies.length
          }
        />
        <Metric
          label="Tracked documents (active company)"
          value={data && recentDocuments.length}
          scope="active company"
        />
        <Metric
          label="Active MCP credentials (workspace-wide)"
          value={data?.credentialCount}
          unavailable={workspace.context?.role === "member"}
        />
      </section>
      <section
        className="panel workspace-overview__activity"
        aria-labelledby="recent-activity-heading"
      >
        <div className="panel-heading workspace-overview__activity-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2 id="recent-activity-heading">Recently updated documents</h2>
          </div>
          {data && !error && <Status>Workspace data is up to date</Status>}
        </div>
        <LoadState loading={loading} error={error} onRetry={retry} />
        {data &&
          !loading &&
          !error &&
          (workspace.noActiveCompany ? (
            <Empty>
              <strong>Select or add an active company</strong>
              <p>
                Choose an active company to review its latest document activity,
                or add a company to begin creating documents.
              </p>
            </Empty>
          ) : recentDocuments.length ? (
            <Table
              caption="Recent documents"
              columns={["Document", "Company", "Commit", "Format", "Updated"]}
            >
              {recentDocuments.map((document) => {
                const detail = detailByDocumentId.get(document.id);
                const commit = detail?.current.commit;
                return (
                  <tr key={document.id}>
                    <td>
                      <strong>{document.title}</strong>
                    </td>
                    <td>
                      {companiesById.get(document.companyId) ?? "Unavailable"}
                    </td>
                    <td>{commit ? commit.commitSha.slice(0, 8) : "—"}</td>
                    <td>{commit?.format ?? "—"}</td>
                    <td>{new Date(document.updatedAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>
              <strong>
                No documents for {workspace.activeCompany?.name} yet
              </strong>
              <p>
                Documents are created by authorized agents and retained as
                immutable commit history.
              </p>
            </Empty>
          ))}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  unavailable = false,
  scope = "workspace-wide",
}: {
  label: string;
  value: number | undefined;
  unavailable?: boolean;
  scope?: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{unavailable ? "—" : (value ?? "—")}</strong>
      <small>
        {unavailable
          ? "Owner-managed workspace access"
          : value === undefined
            ? `Loading ${scope} data`
            : `Current ${scope} total`}
      </small>
    </article>
  );
}
