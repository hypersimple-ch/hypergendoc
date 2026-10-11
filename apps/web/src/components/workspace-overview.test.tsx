/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import type { Document } from "@hypergendoc/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api, workspace } = vi.hoisted(() => ({
  api: {
    documents: vi.fn(),
    document: vi.fn(),
    credentials: vi.fn(),
  },
  workspace: {
    context: { id: "workspace", role: "owner" },
    companies: [] as { id: string; name: string }[],
    loading: false,
    error: undefined as string | undefined,
    reload: vi.fn(),
    activeCompany: undefined as { id: string; name: string } | undefined,
    setActiveCompany: vi.fn(),
    noActiveCompany: false,
  },
}));

vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));
vi.mock("./active-company", () => ({
  useActiveCompany: () => workspace,
}));

import { WorkspaceOverview } from "./workspace-overview";

const company = (id: string, name = id) => ({ id, name });
const document = (id: string, companyId: string, updatedAt: string) => ({
  id,
  companyId,
  title: id,
  createdAt: updatedAt,
  updatedAt,
});
function detail(item: ReturnType<typeof document>, format = "markdown") {
  const commit = {
    documentId: item.id,
    commitSha: item.id.padEnd(8, "x").padEnd(40, "x"),
    parentCommitSha: null,
    styleVersionId: "style-version",
    format,
    createdByType: "credential",
    createdById: "credential",
    createdAt: item.updatedAt,
  };
  return {
    document: item,
    current: {
      commit,
      snapshot: {
        documentId: item.id,
        commitSha: commit.commitSha,
        styleVersionId: "style-version",
        format,
        body: "source",
      },
    },
    commits: [commit],
  };
}

beforeEach(() => {
  workspace.context = { id: "workspace", role: "owner" };
  workspace.companies = [company("acme", "Acme"), company("globex", "Globex")];
  workspace.loading = false;
  workspace.error = undefined;
  workspace.activeCompany = company("acme", "Acme");
  workspace.noActiveCompany = false;
  api.documents.mockResolvedValue([]);
  api.document.mockResolvedValue(undefined);
  api.credentials.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  Object.values(api).forEach((mock) => mock.mockReset());
  workspace.reload.mockReset();
  workspace.setActiveCompany.mockReset();
});

describe("WorkspaceOverview", () => {

  it("uses shared workspace loading and errors, including shared retry", async () => {
    workspace.loading = true;
    const { rerender } = render(<WorkspaceOverview />);
    expect(screen.getByText("Loading secure workspace data…")).toBeVisible();

    workspace.loading = false;
    workspace.error = "We could not load this page. Please try again.";
    rerender(<WorkspaceOverview />);
    (await screen.findByRole("button", { name: "Try again" })).click();
    expect(workspace.reload).toHaveBeenCalledOnce();
  });

  it("counts every active-company document but only shows the ten newest with their history", async () => {
    const newest = Array.from({ length: 9 }, (_, index) =>
      document(
        `new-${index + 1}`,
        "acme",
        `2026-01-${String(index + 3).padStart(2, "0")}T00:00:00.000Z`,
      ),
    );
    const boundary = ["c-boundary", "b-boundary", "a-boundary"].map((id) =>
      document(id, "acme", "2026-01-02T00:00:00.000Z"),
    );
    const foreign = document("foreign", "globex", "2026-02-01T00:00:00.000Z");
    const expected = [...newest].reverse().concat(boundary[2]!);
    api.documents.mockResolvedValue([
      foreign,
      ...boundary,
      ...newest,
    ]);
    api.document.mockImplementation((id: string) => {
      const item = expected.find((candidate) => candidate.id === id);
      if (!item) return Promise.reject(new Error("Older and foreign history is unavailable"));
      return Promise.resolve(detail(item, "html"));
    });

    render(<WorkspaceOverview />);

    const table = await screen.findByRole("table", { name: "Recent documents" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[0]!.textContent),
    ).toEqual(expected.map((item) => item.id));
    for (const item of expected) {
      expect(screen.getByText(item.id).closest("tr")).toHaveTextContent(
        item.id.padEnd(8, "x").slice(0, 8),
      );
      expect(screen.getByText(item.id).closest("tr")).toHaveTextContent("html");
    }
    expect(
      screen.getByText("Tracked documents (active company)").parentElement,
    ).toHaveTextContent("12");
    expect(screen.queryByText("foreign")).not.toBeInTheDocument();
    expect(screen.queryByText("b-boundary")).not.toBeInTheDocument();
    expect(screen.queryByText("c-boundary")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "10 most recently updated documents" }),
    ).toBeVisible();
    expect(screen.getByText("Workspace data is up to date")).toBeVisible();
  });

  it("does not claim fresh or empty results while loading or failed and recovers on retry", async () => {
    let reject!: (reason: unknown) => void;
    const pendingDocuments = new Promise<Document[]>((_resolve, fail) => {
      reject = fail;
    });
    api.documents.mockReturnValueOnce(pendingDocuments);
    render(<WorkspaceOverview />);

    expect(screen.getByText("Loading secure workspace data…")).toBeVisible();
    expect(screen.queryByText("Workspace data is up to date")).not.toBeInTheDocument();
    expect(screen.queryByText("No documents for Acme yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Select or add an active company")).not.toBeInTheDocument();

    await act(async () => {
      reject(new Error("Network unavailable"));
      await pendingDocuments.catch(() => undefined);
    });
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("Workspace data is up to date")).not.toBeInTheDocument();
    expect(screen.queryByText("No documents for Acme yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Select or add an active company")).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText("No documents for Acme yet")).toBeVisible();
    expect(screen.getByText("Workspace data is up to date")).toBeVisible();
  });

  it("keeps loaded activity visible during company reload failures without claiming freshness", async () => {
    const item = document("retained", "acme", "2026-01-01T00:00:00.000Z");
    api.documents.mockResolvedValue([item]);
    api.document.mockResolvedValue(detail(item));
    const view = render(<WorkspaceOverview />);
    expect(await screen.findByRole("row", { name: /retained/ })).toBeVisible();
    expect(screen.getByText("Workspace data is up to date")).toBeVisible();

    workspace.loading = true;
    view.rerender(<WorkspaceOverview />);
    expect(screen.getByRole("row", { name: /retained/ })).toBeVisible();
    expect(screen.queryByText("Workspace data is up to date")).not.toBeInTheDocument();
    workspace.loading = false;
    workspace.error = "Could not refresh companies";
    view.rerender(<WorkspaceOverview />);
    expect(screen.getByRole("row", { name: /retained/ })).toBeVisible();
    expect(screen.queryByText("Workspace data is up to date")).not.toBeInTheDocument();
    expect(screen.queryByText("No documents for Acme yet")).not.toBeInTheDocument();

    workspace.error = undefined;
    view.rerender(<WorkspaceOverview />);
    expect(screen.getByRole("row", { name: /retained/ })).toBeVisible();
    expect(screen.getByText("Workspace data is up to date")).toBeVisible();
  });

  it("reloads for a switched company without rendering stale document details", async () => {
    const acmeDocument = document(
      "acme-doc",
      "acme",
      "2026-01-01T00:00:00.000Z",
    );
    const globexDocument = document(
      "globex-doc",
      "globex",
      "2026-01-02T00:00:00.000Z",
    );
    let resolveAcme: (value: ReturnType<typeof detail>) => void;
    const acmeDetail = new Promise<ReturnType<typeof detail>>((resolve) => {
      resolveAcme = resolve;
    });
    api.documents.mockResolvedValue([acmeDocument, globexDocument]);
    api.document.mockImplementation((id: string) =>
      id === "acme-doc" ? acmeDetail : Promise.resolve(detail(globexDocument)),
    );

    const view = render(<WorkspaceOverview />);
    await waitFor(() => expect(api.document).toHaveBeenCalledWith("acme-doc"));
    workspace.activeCompany = company("globex", "Globex");
    view.rerender(<WorkspaceOverview />);

    expect(await screen.findByText("globex-doc")).toBeVisible();
    resolveAcme!(detail(acmeDocument));
    await waitFor(() =>
      expect(screen.queryByText("acme-doc")).not.toBeInTheDocument(),
    );
    expect(api.document).toHaveBeenCalledWith("globex-doc");
  });

  it("loads workspace-wide credentials only for owners and labels aggregate metrics", async () => {
    api.credentials.mockResolvedValue([
      { revokedAt: null, expiresAt: null },
      { revokedAt: "2026-01-01T00:00:00.000Z", expiresAt: null },
    ]);
    render(<WorkspaceOverview />);

    expect(await screen.findByText("No documents for Acme yet")).toBeVisible();
    expect(
      screen.getByText("Company directory (workspace-wide)").parentElement,
    ).toHaveTextContent("Current workspace-wide total");
    expect(
      screen.getByText("Active MCP credentials (workspace-wide)").parentElement,
    ).toHaveTextContent("1 active · Current workspace-wide total");
    expect(api.credentials).toHaveBeenCalledOnce();
  });

  it("does not request credentials for members", async () => {
    workspace.context = { id: "workspace", role: "member" };
    render(<WorkspaceOverview />);

    expect(await screen.findByText("No documents for Acme yet")).toBeVisible();
    expect(api.credentials).not.toHaveBeenCalled();
    expect(
      screen.getByText("Active MCP credentials (workspace-wide)").parentElement,
    ).toHaveTextContent("Owner-managed workspace access");
  });

  it("guides users with no active company without loading company documents", async () => {
    workspace.activeCompany = undefined;
    workspace.noActiveCompany = true;
    render(<WorkspaceOverview />);

    expect(
      await screen.findByText("Select or add an active company"),
    ).toBeVisible();
    expect(api.documents).not.toHaveBeenCalled();
    expect(api.document).not.toHaveBeenCalled();
  });
});
