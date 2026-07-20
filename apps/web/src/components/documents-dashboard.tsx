"use client";
import { useEffect, useMemo, useState } from "react";
import type { Document, DocumentVersion } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { Empty, LoadState, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";

const formatLabel = (format: DocumentVersion["format"]) =>
  format === "markdown" ? "Markdown" : "HTML";

export function DocumentsDashboard() {
  const data = useLoaded(dashboardApi.documents);
  const companies = useLoaded(dashboardApi.companies);
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Document>();
  const visible = useMemo(
    () =>
      data.value?.filter(
        (d) =>
          (!company || d.companyId === company) &&
          (!query || d.title.toLowerCase().includes(query.toLowerCase())),
      ) ?? [],
    [data.value, company, query],
  );
  const visibleIds = useMemo(
    () => visible.map((d) => d.id).join(","),
    [visible],
  );
  const currentVersions = useLoaded(
    () =>
      Promise.all(
        visible.map(async (document) => {
          const detail = await dashboardApi.document(document.id);
          return {
            document,
            version: detail.versions.find(
              (version) => version.id === document.currentVersionId,
            ),
          };
        }),
      ),
    [visibleIds],
  );
  const filtered = useMemo(
    () =>
      currentVersions.value?.filter(
        ({ version }) => !status || version?.status === status,
      ) ?? [],
    [currentVersions.value, status],
  );
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Documents</p>
          <h1>Immutable render history.</h1>
          <p>
            Documents are created by authorized agents. This dashboard is
            read-only: inspect private artifacts and reproducible metadata
            without editing content.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel filters">
        <FormField label="Search documents">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title"
          />
        </FormField>
        <FormField label="Company">
          <select
            className="input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">All companies</option>
            {companies.value?.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Render status">
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option>pending</option>
            <option>ready</option>
            <option>failed</option>
          </select>
        </FormField>
      </section>
      <section className="panel dashboard-panel">
        <LoadState {...data} />
        {data.value &&
          (visible.length === 0 ? (
            <NoMatchingDocuments />
          ) : (
            <>
              <LoadState {...currentVersions} />
              {currentVersions.value &&
                (filtered.length ? (
                  <Table
                    caption="Documents"
                    columns={[
                      "Document",
                      "Company",
                      "Current version",
                      "Updated",
                      "Open",
                    ]}
                  >
                    {filtered.map(({ document }) => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        onOpen={() => setSelected(document)}
                      />
                    ))}
                  </Table>
                ) : (
                  <NoMatchingDocuments />
                ))}
            </>
          ))}
      </section>
      {selected && (
        <DocumentDetail
          document={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
function NoMatchingDocuments() {
  return (
    <Empty>
      <strong>No matching documents</strong>
      <p>Try another filter, or wait for an authorized agent to create one.</p>
    </Empty>
  );
}
function DocumentRow({
  document,
  onOpen,
}: {
  document: Document;
  onOpen: () => void;
}) {
  return (
    <tr>
      <td>
        <strong>{document.title}</strong>
      </td>
      <td>{document.companyId.slice(0, 8)}…</td>
      <td>{document.currentVersionId ? "Available" : "Pending"}</td>
      <td>{new Date(document.updatedAt).toLocaleDateString()}</td>
      <td>
        <Button tone="quiet" onClick={onOpen}>
          View history
        </Button>
      </td>
    </tr>
  );
}
function DocumentDetail({
  document,
  onClose,
}: {
  document: Document;
  onClose: () => void;
}) {
  const detail = useLoaded(
    () => dashboardApi.document(document.id),
    [document.id],
  );
  const [active, setActive] = useState<DocumentVersion>();
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    if (detail.value?.versions.length) setActive(detail.value.versions.at(-1));
  }, [detail.value]);
  return (
    <section className="panel dashboard-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Document detail</p>
          <h2>{document.title}</h2>
        </div>
        <Button tone="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <LoadState {...detail} />
      {detail.value && (
        <>
          <div className="history-layout">
            <div>
              <h3>Version timeline</h3>
              <ol className="timeline">
                {detail.value.versions.map((v) => (
                  <li key={v.id}>
                    <button
                      className={
                        active?.id === v.id
                          ? "timeline-button timeline-button--active"
                          : "timeline-button"
                      }
                      onClick={() => {
                        setActive(v);
                        setPreviewError(false);
                      }}
                    >
                      Version {v.version}{" "}
                      <span
                        className={`badge ${v.status === "ready" ? "" : "badge--muted"}`}
                      >
                        {v.status}
                      </span>
                      <span className="badge badge--muted">
                        {formatLabel(v.format)}
                      </span>
                      <small>{new Date(v.createdAt).toLocaleString()}</small>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            {active && (
              <div>
                <h3>Private artifact</h3>
                {active.status === "ready" && !previewError ? (
                  <iframe
                    className="pdf-preview"
                    title={`${document.title} version ${active.version} PDF preview`}
                    src={`${dashboardApi.pdfUrl(document.id, active.version)}?disposition=inline`}
                    sandbox="allow-downloads"
                    onError={() => setPreviewError(true)}
                  />
                ) : (
                  <Status
                    kind={active.status === "failed" ? "error" : "warning"}
                  >
                    {active.status === "failed"
                      ? "This render failed. Internal renderer details are not exposed."
                      : "PDF preview is unavailable. You can still use an authorized download when the artifact is ready."}
                  </Status>
                )}
                <div className="row-actions">
                  <a
                    className="button button--quiet"
                    href={dashboardApi.pdfUrl(document.id, active.version)}
                    download
                  >
                    Download PDF
                  </a>
                  <a
                    className="button button--quiet"
                    href={dashboardApi.inputUrl(document.id, active.version)}
                    download
                  >
                    Download input
                  </a>
                </div>
                <h3>Render metadata</h3>
                <dl className="metadata">
                  <dt>Status</dt>
                  <dd>{active.status}</dd>
                  <dt>Format</dt>
                  <dd>{formatLabel(active.format)}</dd>
                  <dt>Style version</dt>
                  <dd>{active.styleVersionId}</dd>
                  <dt>Input hash</dt>
                  <dd>{active.inputHash}</dd>
                  <dt>Source hash</dt>
                  <dd>{active.sourceHash ?? "Not available"}</dd>
                  <dt>Output hash</dt>
                  <dd>{active.outputHash ?? "Not available"}</dd>
                  <dt>Renderer</dt>
                  <dd>{active.rendererVersion ?? "Not available"}</dd>
                  <dt>Created by</dt>
                  <dd>{active.createdByType}</dd>
                </dl>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
