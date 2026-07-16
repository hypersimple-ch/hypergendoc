"use client";
import { useEffect, useMemo, useState } from "react";
import type { Document, DocumentVersion } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { Empty, LoadState, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";
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
          (visible.length ? (
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
              {visible.map((d) => (
                <DocumentRow
                  key={d.id}
                  document={d}
                  status={status}
                  onOpen={() => setSelected(d)}
                />
              ))}
            </Table>
          ) : (
            <Empty>
              <strong>No matching documents</strong>
              <p>
                Try another filter, or wait for an authorized agent to create
                one.
              </p>
            </Empty>
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
function DocumentRow({
  document,
  status,
  onOpen,
}: {
  document: Document;
  status: string;
  onOpen: () => void;
}) {
  const version = useLoaded(
    () =>
      document.currentVersionId
        ? dashboardApi.documentVersion(document.id, 1)
        : Promise.resolve(undefined),
    [document.id],
  );
  if (status && version.value?.status !== status) return null;
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
                    src={dashboardApi.pdfUrl(document.id, active.version)}
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
                    href={dashboardApi.sourceUrl(document.id, active.version)}
                    download
                  >
                    Download LaTeX source
                  </a>
                </div>
                <h3>Render metadata</h3>
                <dl className="metadata">
                  <dt>Status</dt>
                  <dd>{active.status}</dd>
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
