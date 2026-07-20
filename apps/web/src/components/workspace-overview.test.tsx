/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("filters mixed-company documents before fetching details and keeps detail fields", async () => {
    const earlier = document("earlier", "acme", "2026-01-01T00:00:00.000Z");
    const latest = document("latest", "acme", "2026-01-02T00:00:00.000Z");
    const other = document("other", "globex", "2026-01-03T00:00:00.000Z");
    api.documents.mockResolvedValue([earlier, other, latest]);
    api.document.mockImplementation((id: string) =>
      Promise.resolve(
        detail(
          id === earlier.id ? earlier : latest,
          id === latest.id ? "html" : "markdown",
        ),
      ),
    );

    render(<WorkspaceOverview />);

    expect(await screen.findByText("latest")).toBeVisible();
    expect(api.document).toHaveBeenCalledTimes(2);
    expect(api.document).toHaveBeenCalledWith("earlier");
    expect(api.document).toHaveBeenCalledWith("latest");
    expect(api.document).not.toHaveBeenCalledWith("other");
    expect(screen.getByText("latest").closest("tr")).toHaveTextContent(
      "latestAcmelatestxxhtml",
    );
    expect(
      screen.getByText("Tracked documents (active company)").parentElement,
    ).toHaveTextContent("2");
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("latest"),
      expect.stringContaining("earlier"),
    ]);
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
    ).toHaveTextContent("1Current workspace-wide total");
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
