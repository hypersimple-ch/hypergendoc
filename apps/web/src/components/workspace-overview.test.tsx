/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  context: vi.fn(),
  companies: vi.fn(),
  documents: vi.fn(),
  document: vi.fn(),
  credentials: vi.fn(),
}));

vi.mock("../lib/dashboard-api", () => ({ dashboardApi: api }));

import { WorkspaceOverview } from "./workspace-overview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.values(api).forEach((mock) => mock.mockReset());
});

function setBaseData(role: "owner" | "member", documents: unknown[] = []) {
  api.context.mockResolvedValue({ role });
  api.companies.mockResolvedValue([]);
  api.documents.mockResolvedValue(documents);
  api.document.mockResolvedValue(undefined);
  api.credentials.mockResolvedValue([]);
}

describe("WorkspaceOverview", () => {
  it("shows an explicit loading state", () => {
    api.context.mockReturnValue(new Promise(() => undefined));
    api.companies.mockReturnValue(new Promise(() => undefined));
    api.documents.mockReturnValue(new Promise(() => undefined));

    render(<WorkspaceOverview />);

    expect(screen.getByText("Loading secure workspace data…")).toBeVisible();
    expect(screen.getByLabelText("Workspace status")).toHaveTextContent(
      "Loading workspace data",
    );
  });

  it("shows an error and reloads on retry", async () => {
    setBaseData("member");
    api.context.mockRejectedValueOnce(new Error("network"));

    render(<WorkspaceOverview />);

    expect(
      await screen.findByText("We could not load this page. Please try again."),
    ).toBeVisible();
    screen.getByRole("button", { name: "Try again" }).click();

    await waitFor(() =>
      expect(screen.getByText("No documents yet")).toBeVisible(),
    );
    expect(api.context).toHaveBeenCalledTimes(2);
  });

  it("shows an empty workspace without requesting owner credentials for members", async () => {
    setBaseData("member");

    render(<WorkspaceOverview />);

    expect(await screen.findByText("No documents yet")).toBeVisible();
    expect(api.credentials).not.toHaveBeenCalled();
    expect(screen.getByText("MCP credentials").parentElement).toHaveTextContent(
      "Owner-managed access",
    );
  });

  it("counts current ready versions, active owner credentials, and sorts recent documents", async () => {
    const earlier = {
      id: "document-earlier",
      companyId: "company",
      title: "Earlier",
      currentVersionId: "earlier-current",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const latest = {
      id: "document-latest",
      companyId: "company",
      title: "Latest",
      currentVersionId: "latest-current",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    setBaseData("owner", [earlier, latest]);
    api.companies.mockResolvedValue([{ id: "company", name: "Acme" }]);
    api.document.mockImplementation((id: string) =>
      Promise.resolve(
        id === earlier.id
          ? {
              document: earlier,
              versions: [
                { id: "earlier-old", version: 1, status: "failed" },
                { id: "earlier-current", version: 2, status: "ready" },
              ],
            }
          : {
              document: latest,
              versions: [
                { id: "latest-old", version: 1, status: "ready" },
                { id: "latest-current", version: 3, status: "failed" },
              ],
            },
      ),
    );
    api.credentials.mockResolvedValue([
      { revokedAt: null, expiresAt: null },
      { revokedAt: "2026-01-01T00:00:00.000Z", expiresAt: null },
      { revokedAt: null, expiresAt: "2000-01-01T00:00:00.000Z" },
    ]);

    render(<WorkspaceOverview />);

    expect(await screen.findByText("Latest")).toBeVisible();
    expect(screen.getByText("Ready documents").parentElement).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("MCP credentials").parentElement).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("Latest").closest("tr")).toHaveTextContent(
      "Version 3failed",
    );
    expect(
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("Latest"),
      expect.stringContaining("Earlier"),
    ]);
  });
});
