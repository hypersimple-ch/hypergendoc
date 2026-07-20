"use client";
import { useEffect, useMemo, useState } from "react";
import type { Document, DocumentCommit } from "@hypergendoc/contracts";
import { dashboardApi } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, FormField, Input, Status, Table } from "./primitives";

const formatLabel = (format: DocumentCommit["format"]) =>
  format === "markdown" ? "Markdown" : "HTML";
const shortSha = (commitSha: string) => commitSha.slice(0, 8);

export function DocumentsDashboard() {
  const {
    activeCompany,
    error: companyError,
    loading: companyLoading,
    noActiveCompany,
  } = useActiveCompany();
  const data = useLoaded(
    () => (activeCompany ? dashboardApi.documents() : Promise.resolve([])),
    [activeCompany?.id],
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Document>();
  const visible = useMemo(
    () =>
      data.value?.filter(
        (document) =>
          document.companyId === activeCompany?.id &&
          (!query ||
            document.title.toLowerCase().includes(query.toLowerCase())),
      ) ?? [],
    [data.value, activeCompany?.id, query],
  );

  useEffect(() => {
    setSelected(undefined);
  }, [activeCompany?.id]);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Documents</p>
          <h1>Immutable commit history.</h1>
          <p>
            Documents are created by authorized agents. Inspect their source and
            commit metadata, or revert a prior commit as a new revision.
          </p>
        </div>
      </section>
      {activeCompany && (
        <section className="panel dashboard-panel filters">
          <p className="subtle">Showing documents for {activeCompany.name}.</p>
          <FormField label="Search documents">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title"
            />
          </FormField>
        </section>
      )}
      <section className="panel dashboard-panel">
        <LoadState loading={companyLoading} error={companyError} />
        {noActiveCompany ? (
          <NoActiveCompany />
        ) : activeCompany ? (
          <>
            <LoadState {...data} />
            {data.value &&
              (visible.length ? (
                <Table
                  caption="Documents"
                  columns={["Document", "Updated", "Open"]}
                >
                  {visible.map((document) => (
                    <DocumentRow
                      key={document.id}
                      document={document}
                      onOpen={() => setSelected(document)}
                    />
                  ))}
                </Table>
              ) : query ? (
                <NoMatchingDocuments />
              ) : (
                <NoDocumentsForCompany companyName={activeCompany.name} />
              ))}
          </>
        ) : null}
      </section>
      {selected && selected.companyId === activeCompany?.id && (
        <DocumentDetail
          document={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
function NoActiveCompany() {
  return (
    <Empty>
      <strong>Choose or create a company to view documents</strong>
      <p>Documents are organized by the active company in this workspace.</p>
    </Empty>
  );
}
function NoDocumentsForCompany({ companyName }: { companyName: string }) {
  return (
    <Empty>
      <strong>No documents for {companyName}</strong>
      <p>Wait for an authorized agent to create one.</p>
    </Empty>
  );
}
function NoMatchingDocuments() {
  return (
    <Empty>
      <strong>No matching documents</strong>
      <p>Try another search, or wait for an authorized agent to create one.</p>
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
  const [active, setActive] = useState<DocumentCommit>();
  const [showPdf, setShowPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  useEffect(() => {
    if (detail.value) setActive(detail.value.current.commit);
  }, [detail.value]);
  const source = useLoaded(() => {
    if (!detail.value || !active) return Promise.resolve(undefined);
    return active.commitSha === detail.value.current.commit.commitSha
      ? Promise.resolve(detail.value.current)
      : dashboardApi.documentCommit(document.id, active.commitSha);
  }, [document.id, detail.value?.current.commit.commitSha, active?.commitSha]);
  const isCurrent =
    active?.commitSha === detail.value?.current.commit.commitSha;
  const activeSource =
    source.value?.commit.commitSha === active?.commitSha
      ? source.value
      : undefined;
  async function revert() {
    if (
      !active ||
      busy ||
      !confirm(
        `Revert to commit ${shortSha(active.commitSha)}? This creates a new commit.`,
      )
    )
      return;
    setBusy(true);
    setMessage(undefined);
    try {
      const current = await dashboardApi.revertDocument(
        document.id,
        active.commitSha,
      );
      setActive(current.commit);
      setShowPdf(false);
      setMessage({ text: "Reverted as a new commit.", error: false });
      detail.reload();
    } catch (error) {
      setMessage({ text: safeError(error), error: true });
    } finally {
      setBusy(false);
    }
  }
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
        <div className="history-layout">
          <div>
            <h3>Commit history</h3>
            <ol className="timeline">
              {detail.value.commits.map((commit) => (
                <li key={commit.commitSha}>
                  <button
                    className={
                      active?.commitSha === commit.commitSha
                        ? "timeline-button timeline-button--active"
                        : "timeline-button"
                    }
                    aria-label={`Commit ${shortSha(commit.commitSha)}`}
                    onClick={() => {
                      setActive(commit);
                      setShowPdf(false);
                      setMessage(undefined);
                    }}
                  >
                    <strong>{shortSha(commit.commitSha)}</strong>
                    <span className="badge badge--muted">
                      {formatLabel(commit.format)}
                    </span>
                    <small>{new Date(commit.createdAt).toLocaleString()}</small>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {active && (
            <div>
              <h3>{isCurrent ? "Current source" : "Historical source"}</h3>
              <LoadState {...source} />
              {activeSource && (
                <>
                  <pre className="document-source">
                    {activeSource.snapshot.body}
                  </pre>
                  <div className="row-actions">
                    <a
                      className="button button--quiet"
                      href={dashboardApi.sourceUrl(
                        document.id,
                        active.commitSha,
                      )}
                      download
                    >
                      Download source
                    </a>
                    {!isCurrent && (
                      <Button
                        tone="quiet"
                        disabled={busy}
                        onClick={() => void revert()}
                      >
                        Revert as new commit
                      </Button>
                    )}
                    {isCurrent && (
                      <>
                        <Button tone="quiet" onClick={() => setShowPdf(true)}>
                          Preview PDF
                        </Button>
                        <a
                          className="button button--quiet"
                          href={dashboardApi.pdfUrl(document.id)}
                          download
                        >
                          Download PDF
                        </a>
                      </>
                    )}
                  </div>
                  {isCurrent && showPdf && (
                    <iframe
                      className="pdf-preview"
                      title={`${document.title} current PDF preview`}
                      src={`${dashboardApi.pdfUrl(document.id)}?disposition=inline`}
                      sandbox="allow-downloads"
                    />
                  )}
                </>
              )}
              {message && (
                <Status kind={message.error ? "error" : "success"}>
                  {message.text}
                </Status>
              )}
              <h3>Commit metadata</h3>
              <dl className="metadata">
                <dt>Commit</dt>
                <dd>{active.commitSha}</dd>
                <dt>Parent commit</dt>
                <dd>{active.parentCommitSha ?? "Initial commit"}</dd>
                <dt>Format</dt>
                <dd>{formatLabel(active.format)}</dd>
                <dt>Style version</dt>
                <dd>{active.styleVersionId}</dd>
                <dt>Created by</dt>
                <dd>
                  {active.createdByType} {active.createdById}
                </dd>
                <dt>Created</dt>
                <dd>{new Date(active.createdAt).toLocaleString()}</dd>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
