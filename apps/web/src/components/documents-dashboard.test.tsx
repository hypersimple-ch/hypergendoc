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
import type { Document, DocumentVersion } from "@hypergendoc/contracts";

const { companies, document, documents } = vi.hoisted(() => ({
  companies: vi.fn(),
  document: vi.fn(),
  documents: vi.fn(),
}));

vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    companies,
    document,
    documents,
    pdfUrl: (id: string, version: number) =>
      `/api/documents/${id}/versions/${version}/pdf`,
    inputUrl: (id: string, version: number) =>
      `/api/documents/${id}/versions/${version}/input`,
  },
}));

import { DocumentsDashboard } from "./documents-dashboard";

const documentId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const nextVersionId = "44444444-4444-4444-8444-444444444444";
const baseDocument: Document = {
  id: documentId,
  companyId,
  title: "Proposal",
  currentVersionId: nextVersionId,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};
const version = (
  id: string,
  number: number,
  status: DocumentVersion["status"],
  format: DocumentVersion["format"] = "markdown",
): DocumentVersion => ({
  id,
  documentId,
  version: number,
  styleVersionId: "55555555-5555-4555-8555-555555555555",
  format,
  body: "Read only",
  status,
  inputHash: "a".repeat(64),
  sourceHash: null,
  outputHash: null,
  rendererVersion: null,
  createdByType: "user",
  createdById: "66666666-6666-4666-8666-666666666666",
  createdAt: "2026-01-01T00:00:00.000Z",
});

function mockDashboard(versions: DocumentVersion[]) {
  companies.mockResolvedValue([]);
  documents.mockResolvedValue([baseDocument]);
  document.mockResolvedValue({ document: baseDocument, versions });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DocumentsDashboard", () => {
  it("filters using the current version, including a failed version after version 1", async () => {
    mockDashboard([
      version(versionId, 1, "ready"),
      version(nextVersionId, 2, "failed"),
    ]);
    render(<DocumentsDashboard />);

    await screen.findByRole("button", { name: "View history" });
    fireEvent.change(screen.getByLabelText("Render status"), {
      target: { value: "failed" },
    });
    expect(
      await screen.findByRole("button", { name: "View history" }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Render status"), {
      target: { value: "ready" },
    });
    await waitFor(() =>
      expect(screen.getByText("No matching documents")).toBeVisible(),
    );
    expect(
      screen.queryByRole("columnheader", { name: "Document" }),
    ).not.toBeInTheDocument();
  });

  it("shows a no-match state without an empty table when text filtering removes every row", async () => {
    mockDashboard([version(nextVersionId, 2, "ready")]);
    render(<DocumentsDashboard />);

    await screen.findByRole("button", { name: "View history" });
    fireEvent.change(screen.getByLabelText("Search documents"), {
      target: { value: "missing" },
    });

    expect(await screen.findByText("No matching documents")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("uses a responsive table wrapper and an inline-only PDF preview while downloads remain attachments", async () => {
    mockDashboard([version(nextVersionId, 2, "ready")]);
    render(<DocumentsDashboard />);

    const history = await screen.findByRole("button", { name: "View history" });
    expect(screen.getByRole("table").parentElement).toHaveClass("table-wrap");

    fireEvent.click(history);
    const preview = await screen.findByTitle("Proposal version 2 PDF preview");
    expect(preview).toHaveAttribute(
      "src",
      `/api/documents/${documentId}/versions/2/pdf?disposition=inline`,
    );
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
      "href",
      `/api/documents/${documentId}/versions/2/pdf`,
    );
    expect(
      screen.getByRole("link", { name: "Download input" }),
    ).toHaveAttribute("href", `/api/documents/${documentId}/versions/2/input`);
    expect(
      screen.queryByRole("link", { name: /source/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the immutable input format in history and active version metadata", async () => {
    mockDashboard([
      version(versionId, 1, "ready", "markdown"),
      version(nextVersionId, 2, "ready", "html"),
    ]);
    render(<DocumentsDashboard />);

    fireEvent.click(
      await screen.findByRole("button", { name: "View history" }),
    );
    expect(await screen.findByText("Markdown")).toBeVisible();
    await waitFor(() => expect(screen.getAllByText("HTML")).toHaveLength(2));
  });
});
