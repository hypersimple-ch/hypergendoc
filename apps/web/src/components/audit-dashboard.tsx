"use client";

import { useRef, useState } from "react";
import { Filter, ScrollText, ShieldCheck } from "lucide-react";
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
      <section className="panel feature-state border border-border bg-card p-5">
        <div className="flex gap-3">
          <ShieldCheck
            className="mt-0.5 size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <p className="eyebrow">Governance / audit log</p>
            <h1 className="mt-1">Owner access required.</h1>
            <Status kind="warning">
              Only workspace owners can review security and change events.
            </Status>
          </div>
        </div>
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
      <section className="audit-dashboard page-heading flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow">Governance / audit log</p>
          <h1 className="mt-1">Security activity</h1>
          <p>
            Review workspace changes and security-relevant actions. Request
            bodies, credentials, and document content are never displayed.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Append-only event trail
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Audit log summary"
      >
        <SummaryCard
          icon={<ScrollText className="size-4" />}
          label="Loaded events"
          value={firstPage.value ? events.length : "—"}
        />
        <SummaryCard
          icon={<ShieldCheck className="size-4" />}
          label="Showing"
          value={firstPage.value ? filteredEvents.length : "—"}
        />
        <SummaryCard
          icon={<ShieldCheck className="size-4" />}
          label="Access"
          value="Owners only"
        />
      </section>

      <section className="panel dashboard-panel border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Event register</p>
            <h2 className="text-base font-semibold">Workspace audit events</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Sensitive request data is intentionally excluded.
          </p>
        </div>
        <LoadState {...firstPage} />
        {firstPage.value && events.length > 0 && (
          <div className="mb-4 grid gap-3 rounded-lg border border-border bg-muted/40 p-3 md:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="grid gap-1.5 text-sm font-medium">
              Filter events
              <input
                className="input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Action, target, or actor"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <Filter className="size-3.5" aria-hidden="true" />
                Outcome
              </span>
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
          <div
            className="mutation-feedback"
            aria-live="polite"
            aria-atomic="true"
          >
            <Status kind="success">{announcement}</Status>
          </div>
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
                      <strong className="font-mono text-sm">
                        {event.action}
                      </strong>
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
                <div className="mt-4 flex justify-end border-t border-border pt-4">
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

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
