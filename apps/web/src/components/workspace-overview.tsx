"use client";

import Link from "next/link";
import { dashboardApi, type DocumentDetail } from "../lib/dashboard-api";
import { Empty, LoadState, useLoaded } from "./dashboard-state";
import { Status, Table } from "./primitives";

type OverviewData = {
  companies: Awaited<ReturnType<typeof dashboardApi.companies>>;
  documents: Awaited<ReturnType<typeof dashboardApi.documents>>;
  details: DocumentDetail[];
  role: "owner" | "member";
  credentialCount?: number | undefined;
};

async function loadOverview(): Promise<OverviewData> {
  const [context, companies, documents] = await Promise.all([
    dashboardApi.context(),
    dashboardApi.companies(),
    dashboardApi.documents(),
  ]);
  const [details, credentials] = await Promise.all([
    Promise.all(
      documents.map((document) => dashboardApi.document(document.id)),
    ),
    context.role === "owner" ? dashboardApi.credentials() : Promise.resolve(),
  ]);

  return {
    companies,
    documents,
    details,
    role: context.role,
    credentialCount: credentials?.filter(
      (credential) =>
        !credential.revokedAt &&
        (!credential.expiresAt || new Date(credential.expiresAt) > new Date()),
    ).length,
  };
}

export function WorkspaceOverview() {
  const data = useLoaded(loadOverview);
  const detailByDocumentId = new Map(
    data.value?.details.map((detail) => [detail.document.id, detail]),
  );
  const recentDocuments = [...(data.value?.documents ?? [])].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
  const trackedDocuments = recentDocuments.length;
  const companiesById = new Map(
    data.value?.companies.map((company) => [company.id, company.name]),
  );

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>The document desk.</h1>
          <p>
            Set up companies and their visual systems before agents create
            documents with immutable commit history.
          </p>
        </div>
        <Link className="button button--primary" href="/workspace/companies">
          Add a company
        </Link>
      </section>
      <section className="metric-grid" aria-label="Workspace status">
        <Metric label="Companies" value={data.value?.companies.length} />
        <Metric
          label="Tracked documents"
          value={data.value && trackedDocuments}
        />
        <Metric
          label="MCP credentials"
          value={data.value?.credentialCount}
          unavailable={data.value?.role === "member"}
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent documents</p>
            <h2>Immutable by design</h2>
          </div>
          {data.value && <Status>Workspace data is up to date</Status>}
        </div>
        <LoadState {...data} />
        {data.value &&
          (recentDocuments.length ? (
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
              <strong>No documents yet</strong>
              <p>
                Documents are created by authorized agents and retained as
                immutable commit history.
              </p>
            </Empty>
          ))}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  unavailable = false,
}: {
  label: string;
  value: number | undefined;
  unavailable?: boolean;
}) {
  return (
    <article>
      <span>{label}</span>
      <strong>{unavailable ? "—" : (value ?? "—")}</strong>
      <small>
        {unavailable
          ? "Owner-managed access"
          : value === undefined
            ? "Loading workspace data"
            : "Current workspace total"}
      </small>
    </article>
  );
}
