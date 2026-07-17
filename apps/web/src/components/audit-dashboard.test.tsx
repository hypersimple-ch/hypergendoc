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

const api = vi.hoisted(() => ({ context: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));

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
    api.context.mockResolvedValue({ role: "member" });

    render(<AuditDashboard />);

    expect(await screen.findByText("Owner access required.")).toBeVisible();
    expect(api.audit).not.toHaveBeenCalled();
  });

  it("loads and paginates owner audit events", async () => {
    api.context.mockResolvedValue({ role: "owner" });
    api.audit
      .mockResolvedValueOnce({ items: [event("event-1")], nextOffset: 50 })
      .mockResolvedValueOnce({ items: [event("event-2")] });

    render(<AuditDashboard />);

    expect(await screen.findByText("membership.role_changed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Load more events" }));

    await waitFor(() => expect(api.audit).toHaveBeenLastCalledWith(50));
    expect(screen.getAllByText("membership.role_changed")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Load more events" }),
    ).not.toBeInTheDocument();
  });
});
