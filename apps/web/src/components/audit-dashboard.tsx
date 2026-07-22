"use client";
import { useRef, useState } from "react";
import { dashboardApi, type WorkspaceAuditEvent } from "../lib/dashboard-api";
import { useActiveCompany } from "./active-company";
import { Empty, LoadState, safeError, useLoaded } from "./dashboard-state";
import { Button, Status, Table } from "./primitives";

export function AuditDashboard() {
  const { context, loading, error, reload } = useActiveCompany();

  if (loading || error)
    return <LoadState loading={loading} error={error} reload={reload} />;
  if (context?.role !== "owner")
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
  const [outcome, setOutcome] = useState("all");
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState<string>();
  const loadingMoreRef = useRef(false);
  const events = [...(firstPage.value?.items ?? []), ...additional];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEvents = events.filter(
    (event) =>
      (outcome === "all" || event.outcome === outcome) &&
      (!normalizedQuery ||
        `${event.action} ${event.targetType} ${event.actorType}`
          .toLowerCase()
          .includes(normalizedQuery)),
  );
  const offset = loadedMore ? nextOffset : firstPage.value?.nextOffset;

  async function loadMore() {
    if (loadingMoreRef.current || offset === undefined) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await dashboardApi.audit(offset);
      setAdditional((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
      setLoadedMore(true);
      setAnnouncement(
        page.items.length
          ? `Loaded ${page.items.length} more audit event${page.items.length === 1 ? "" : "s"}.`
          : "No more audit events were returned.",
      );
    } catch (error) {
      setMoreError(safeError(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  return (
    <>
      <section className="page-heading audit-dashboard">
        <div>
          <p className="eyebrow">Audit log</p>
          <h1>A clear trail, without the secrets.</h1>
          <p>
            Review workspace changes and security-relevant actions. Request
            bodies, credentials, and document content are never displayed.
          </p>
        </div>
      </section>
      <section className="panel dashboard-panel audit-dashboard__events">
        <LoadState {...firstPage} />
        {firstPage.value && events.length > 0 && (
          <div className="audit-dashboard__filters">
            <label>
              Filter events
              <input
                className="input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Action, target, or actor"
              />
            </label>
            <label>
              Outcome
              <select
                className="input"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
              >
                <option value="all">All outcomes</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </label>
          </div>
        )}
        {announcement && (
          <p className="audit-dashboard__announcement" aria-live="polite">
            {announcement}
          </p>
        )}
        {firstPage.value &&
          (events.length ? (
            <>
              <Table
                caption="Workspace audit events"
                columns={["Event", "Target", "Actor", "Outcome", "Time"]}
              >
                {filteredEvents.map((event) => (
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
              {filteredEvents.length === 0 && (
                <Empty>
                  <strong>No matching audit events</strong>
                  <p>Change or clear the filters to see loaded events.</p>
                </Empty>
              )}
              {moreError && <Status kind="error">{moreError}</Status>}
              {offset !== undefined && (
                <div className="audit-dashboard__pagination">
                  <Button
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more events"}
                  </Button>
                </div>
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
