"use client";
import { useState } from "react";
import { dashboardApi, type WorkspaceAuditEvent } from "../lib/dashboard-api";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, Status, Table } from "./primitives";

export function AuditDashboard() {
  const context = useLoaded(dashboardApi.context);

  if (context.loading || context.error) return <LoadState {...context} />;
  if (context.value?.role !== "owner")
    return (
      <section className="panel feature-state">
        <p className="eyebrow">Audit log</p>
        <h1>Owner access required.</h1>
        <Status kind="warning">
          Only workspace owners can review security and change events.
        </Status>
      </section>
    );
  return <OwnerAuditLog />;
}

function OwnerAuditLog() {
  const firstPage = useLoaded(() => dashboardApi.audit());
  const [additional, setAdditional] = useState<WorkspaceAuditEvent[]>([]);
  const [nextOffset, setNextOffset] = useState<number>();
  const [loadedMore, setLoadedMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string>();
  const events = [...(firstPage.value?.items ?? []), ...additional];
  const offset = loadedMore ? nextOffset : firstPage.value?.nextOffset;

  async function loadMore() {
    if (loadingMore || offset === undefined) return;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await dashboardApi.audit(offset);
      setAdditional((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
      setLoadedMore(true);
    } catch (error) {
      setMoreError(safeError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Audit log</p>
          <h1>A clear trail, without the secrets.</h1>
          <p>
            Review workspace changes and security-relevant actions. Request
            bodies, credentials, and document content are never displayed.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel">
        <LoadState {...firstPage} />
        {firstPage.value &&
          (events.length ? (
            <>
              <Table
                caption="Workspace audit events"
                columns={["Event", "Target", "Actor", "Outcome", "Time"]}
              >
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.action}</strong>
                    </td>
                    <td>{event.targetType}</td>
                    <td>{event.actorType}</td>
                    <td>
                      <span
                        className={`badge ${event.outcome === "success" ? "" : "badge--muted"}`}
                      >
                        {event.outcome}
                      </span>
                    </td>
                    <td>{new Date(event.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </Table>
              {moreError && <Status kind="error">{moreError}</Status>}
              {offset !== undefined && (
                <Button disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more events"}
                </Button>
              )}
            </>
          ) : (
            <Empty>
              <strong>No audit events yet</strong>
              <p>Workspace changes will appear here as they occur.</p>
            </Empty>
          ))}
      </section>
    </>
  );
}
