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
import type { Company } from "@hypergendoc/contracts";

const { context, companies } = vi.hoisted(() => ({
  context: vi.fn(),
  companies: vi.fn(),
}));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: { context, companies },
}));

import {
  ActiveCompanyProvider,
  activeCompanyStorageKey,
  useActiveCompany,
} from "./active-company";

const workspace = {
  id: "workspace-1",
  name: "Studio",
  userId: "user-1",
  role: "owner" as const,
};
const company = (id: string, archivedAt: string | null = null): Company => ({
  id,
  workspaceId: workspace.id,
  name: id,
  archivedAt,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function Probe() {
  const state = useActiveCompany();
  return (
    <>
      <output data-testid="company">{state.activeCompany?.id ?? "none"}</output>
      <output data-testid="workspace">{state.context?.id ?? "none"}</output>
      <output data-testid="state">
        {state.loading ? "loading" : (state.error ?? "ready")}
      </output>
      <output data-testid="no-company">{String(state.noActiveCompany)}</output>
      <button onClick={() => state.setActiveCompany("company-2")}>
        Switch
      </button>
      <button onClick={state.reload}>Reload</button>
    </>
  );
}

function renderProvider() {
  return render(
    <ActiveCompanyProvider>
      <Probe />
    </ActiveCompanyProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});

describe("ActiveCompanyProvider", () => {
  it("restores a valid saved company for the server-resolved workspace", async () => {
    localStorage.setItem(activeCompanyStorageKey(workspace.id), "company-2");
    context.mockResolvedValue(workspace);
    companies.mockResolvedValue([company("company-1"), company("company-2")]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-2"),
    );
    expect(screen.getByTestId("workspace")).toHaveTextContent(workspace.id);
  });

  it("uses the first active company in API order when there is no saved choice", async () => {
    context.mockResolvedValue(workspace);
    companies.mockResolvedValue([company("company-2"), company("company-1")]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-2"),
    );
  });

  it("replaces archived and missing saved choices with the first active company", async () => {
    context.mockResolvedValue(workspace);
    companies.mockResolvedValue([
      company("archived", "2026-01-02T00:00:00.000Z"),
      company("company-1"),
    ]);
    localStorage.setItem(activeCompanyStorageKey(workspace.id), "archived");

    const { unmount } = renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-1"),
    );
    unmount();

    localStorage.setItem(activeCompanyStorageKey(workspace.id), "missing");
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-1"),
    );
  });

  it("exposes a guided no-active-company state when all companies are archived", async () => {
    context.mockResolvedValue(workspace);
    companies.mockResolvedValue([
      company("archived", "2026-01-02T00:00:00.000Z"),
    ]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("no-company")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("company")).toHaveTextContent("none");
    expect(context).toHaveBeenCalledOnce();
    expect(companies).toHaveBeenCalledOnce();
  });

  it("persists a user-selected active company", async () => {
    context.mockResolvedValue(workspace);
    companies.mockResolvedValue([company("company-1"), company("company-2")]);

    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    expect(screen.getByTestId("company")).toHaveTextContent("company-2");
    expect(localStorage.getItem(activeCompanyStorageKey(workspace.id))).toBe(
      "company-2",
    );
  });

  it("reconciles an archived active company when reloading", async () => {
    context.mockResolvedValue(workspace);
    companies
      .mockResolvedValueOnce([company("company-1"), company("company-2")])
      .mockResolvedValueOnce([
        company("company-1", "2026-01-02T00:00:00.000Z"),
        company("company-2"),
      ]);

    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() =>
      expect(screen.getByTestId("company")).toHaveTextContent("company-2"),
    );
  });

  it("reports failed shared loads without selecting a company", async () => {
    context.mockRejectedValue(new Error("offline"));
    companies.mockResolvedValue([company("company-1")]);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("state")).toHaveTextContent(
        "We could not load this page. Please try again.",
      ),
    );
    expect(screen.getByTestId("company")).toHaveTextContent("none");
  });
});
