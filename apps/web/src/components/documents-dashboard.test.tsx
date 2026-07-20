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
import type {
  Company,
  Document,
  DocumentCommit,
  DocumentCurrentSource,
  DocumentDetail,
} from "@hypergendoc/contracts";

const { activeCompany, document, documentCommit, documents, revertDocument } =
  vi.hoisted(() => ({
    activeCompany: vi.fn(),
    document: vi.fn(),
    documentCommit: vi.fn(),
    documents: vi.fn(),
    revertDocument: vi.fn(),
  }));

vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    document,
    documentCommit,
    documents,
    revertDocument,
    pdfUrl: (id: string) => `/api/documents/${id}/pdf`,
    sourceUrl: (id: string, commitSha: string) =>
      `/api/documents/${id}/commits/${commitSha}/source`,
  },
}));
vi.mock("./active-company", () => ({ useActiveCompany: activeCompany }));

import { DocumentsDashboard } from "./documents-dashboard";

const documentId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const otherCompanyId = "55555555-5555-4555-8555-555555555555";
const styleVersionId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
const oldSha = "a".repeat(40);
const currentSha = "b".repeat(40);
const company = (id: string, name: string) =>
  ({
    id,
    name,
    workspaceId: "workspace-1",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as Company;
const acme = company(companyId, "Acme Studio");
const beta = company(otherCompanyId, "Beta Works");
const baseDocument: Document = {
  id: documentId,
  companyId,
  title: "Proposal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};
const commit = (
  commitSha: string,
  parentCommitSha: string | null,
  format: DocumentCommit["format"] = "markdown",
): DocumentCommit => ({
  documentId,
  commitSha,
  parentCommitSha,
  styleVersionId,
  format,
  createdByType: "credential",
  createdById: actorId,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const oldCommit = commit(oldSha, null);
const currentCommit = commit(currentSha, oldSha, "html");
const source = (
  entry: DocumentCommit,
  body: string,
): DocumentCurrentSource => ({
  commit: entry,
  snapshot: {
    documentId,
    commitSha: entry.commitSha,
    styleVersionId: entry.styleVersionId,
    format: entry.format,
    body,
  },
});
const detail = (): DocumentDetail => ({
  document: baseDocument,
  current: source(currentCommit, "<h1>Current source</h1>"),
  commits: [currentCommit, oldCommit],
});

function setActiveCompany(active?: Company) {
  activeCompany.mockReturnValue({
    activeCompany: active,
    companies: active ? [active] : [],
    loading: false,
    error: undefined,
    noActiveCompany: !active,
    reload: vi.fn(),
    setActiveCompany: vi.fn(),
  });
}

function mockDashboard() {
  setActiveCompany(acme);
  documents.mockResolvedValue([baseDocument]);
  document.mockResolvedValue(detail());
  documentCommit.mockResolvedValue(source(oldCommit, "# Historical source"));
}

async function openHistory() {
  render(<DocumentsDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "View history" }));
  await screen.findByText("<h1>Current source</h1>");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DocumentsDashboard", () => {
  it("filters workspace documents to the active company and reloads on a company switch", async () => {
    const betaDocument = {
      ...baseDocument,
      id: "66666666-6666-4666-8666-666666666666",
      companyId: otherCompanyId,
      title: "Beta brief",
    };
    setActiveCompany(acme);
    documents.mockResolvedValue([baseDocument, betaDocument]);

    const view = render(<DocumentsDashboard />);
    expect(await screen.findByText("Proposal")).toBeVisible();
    expect(screen.queryByText("Beta brief")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing documents for Acme Studio."),
    ).toBeVisible();
    expect(
      screen.queryByRole("columnheader", { name: "Company" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(`${companyId.slice(0, 8)}…`),
    ).not.toBeInTheDocument();

    setActiveCompany(beta);
    view.rerender(<DocumentsDashboard />);

    expect(await screen.findByText("Beta brief")).toBeVisible();
    expect(screen.queryByText("Proposal")).not.toBeInTheDocument();
    await waitFor(() => expect(documents).toHaveBeenCalledTimes(2));
  });

  it("does not load workspace documents without an active company", async () => {
    setActiveCompany();
    render(<DocumentsDashboard />);

    expect(
      await screen.findByText("Choose or create a company to view documents"),
    ).toBeVisible();
    expect(documents).not.toHaveBeenCalled();
  });

  it("distinguishes an active company with no documents from a search with no match", async () => {
    setActiveCompany(acme);
    documents.mockResolvedValue([]);
    render(<DocumentsDashboard />);

    expect(
      await screen.findByText("No documents for Acme Studio"),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "missing" },
    });
    expect(await screen.findByText("No matching documents")).toBeVisible();
  });

  it("shows commit metadata and loads historical source when a commit is selected", async () => {
    mockDashboard();
    await openHistory();

    expect(screen.getByText(currentSha.slice(0, 8))).toBeVisible();
    expect(screen.getByText(`credential ${actorId}`)).toBeVisible();
    expect(screen.getAllByText("HTML")).toHaveLength(2);
    expect(screen.getByText(styleVersionId)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: `Commit ${oldSha.slice(0, 8)}` }),
    );
    expect(await screen.findByText("# Historical source")).toBeVisible();
    expect(documentCommit).toHaveBeenCalledWith(documentId, oldSha);
    expect(
      screen.getByRole("link", { name: "Download source" }),
    ).toHaveAttribute(
      "href",
      `/api/documents/${documentId}/commits/${oldSha}/source`,
    );
    expect(
      screen.queryByRole("button", { name: "Preview PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download PDF" }),
    ).not.toBeInTheDocument();
  });

  it("does not request or display a PDF until preview is explicitly selected", async () => {
    mockDashboard();
    await openHistory();

    expect(
      screen.queryByTitle("Proposal current PDF preview"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revert as new commit" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));
    expect(screen.getByTitle("Proposal current PDF preview")).toHaveAttribute(
      "src",
      `/api/documents/${documentId}/pdf?disposition=inline`,
    );
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      `/api/documents/${documentId}/pdf`,
    );
  });

  it("confirms a revert, creates a new commit, and refreshes history", async () => {
    mockDashboard();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const revertedCommit = commit("c".repeat(40), currentSha);
    revertDocument.mockResolvedValue(source(revertedCommit, "Reverted source"));
    document.mockResolvedValueOnce(detail()).mockResolvedValueOnce({
      ...detail(),
      current: source(revertedCommit, "Reverted source"),
      commits: [revertedCommit, currentCommit, oldCommit],
    });
    await openHistory();

    fireEvent.click(
      screen.getByRole("button", { name: `Commit ${oldSha.slice(0, 8)}` }),
    );
    await screen.findByText("# Historical source");
    fireEvent.click(
      screen.getByRole("button", { name: "Revert as new commit" }),
    );

    await waitFor(() =>
      expect(revertDocument).toHaveBeenCalledWith(documentId, oldSha),
    );
    await waitFor(() =>
      expect(screen.getByText("Reverted as a new commit.")).toBeVisible(),
    );
    await waitFor(() => expect(document).toHaveBeenCalledTimes(2));
  });

  it("shows a no-match state without an empty table when text filtering removes every row", async () => {
    mockDashboard();
    render(<DocumentsDashboard />);

    await screen.findByRole("button", { name: "View history" });
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "missing" },
    });

    expect(await screen.findByText("No matching documents")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
