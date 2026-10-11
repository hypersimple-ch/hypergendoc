/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ audit: vi.fn() }));
const activeCompany = vi.hoisted(() => vi.fn());
vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { AuditDashboard } from "./audit-dashboard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const event = (id: string) => ({
  id,
  actorType: "user",
  action: "membership.role_changed",
  targetType: "membership",
  outcome: "success",
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("AuditDashboard", () => {
  it("shows an owner-only state without requesting events for members", async () => {
    activeCompany.mockReturnValue({
      context: { role: "member" },
      loading: false,
      reload: vi.fn(),
    });

    render(<AuditDashboard />);

    expect(await screen.findByText("Owner access required.")).toBeVisible();
    expect(api.audit).not.toHaveBeenCalled();
  });

  it("loads and paginates owner audit events", async () => {
    activeCompany.mockReturnValue({
      context: { role: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.audit
      .mockResolvedValueOnce({ items: [event("event-1")], nextOffset: 50 })
      .mockResolvedValueOnce({ items: [event("event-2")] });

    render(<AuditDashboard />);

    expect(await screen.findByText("membership.role_changed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Load more events" }));

    await waitFor(() =>
      expect(screen.getAllByText("membership.role_changed")).toHaveLength(2),
    );
    expect(
      screen.queryByRole("button", { name: "Load more events" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Filter events" }), {
      target: { value: "credential" },
    });
    expect(screen.getByText("No matching audit events")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter events" }), {
      target: { value: "membership" },
    });
    expect(screen.getAllByText("membership.role_changed")).toHaveLength(2);
  });

  it("shows only the filtered empty state while retaining pagination recovery", async () => {
    activeCompany.mockReturnValue({
      context: { role: "owner" },
      loading: false,
      reload: vi.fn(),
    });
    api.audit
      .mockResolvedValueOnce({ items: [event("event-1")], nextOffset: 50 })
      .mockResolvedValueOnce({ items: [{ ...event("event-2"), action: "credential.created" }] });
    render(<AuditDashboard />);
    await screen.findByText("membership.role_changed");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter events" }), {
      target: { value: "credential" },
    });
    expect(screen.getByText("No matching audit events")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more events" }));
    expect(await screen.findByText("credential.created")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByText("No matching audit events")).not.toBeInTheDocument();
  });
});
