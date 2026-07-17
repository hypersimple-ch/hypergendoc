import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api-client";
import { safeError } from "../components/dashboard-state";
import { dashboardApi } from "./dashboard-api";

afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });

describe("dashboard contract adapters", () => {
  it("creates a scoped credential without a workspace id and only returns its token to the caller", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        credential: {
          id: "credential",
          workspaceId: "server-only",
          name: "Agent",
          prefix: "hgd_123",
          companyIds: ["company"],
          actions: ["documents:read"],
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        token: "hgd_secret_once",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const created = await dashboardApi.createCredential({
      name: "Agent",
      companyIds: ["company"],
      actions: ["documents:read"],
    });
    expect(created.token).toBe("hgd_secret_once");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/mcp-credentials");
    const createInit = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(createInit.body as string).not.toContain("workspaceId");
  });
  it("unwraps the server style creation envelope without sending a workspace id", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        style: {
          id: "style",
          companyId: "company",
          name: "Brand",
          activeVersionId: "style-version",
          archivedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        version: {
          id: "style-version",
          styleId: "style",
          version: 1,
          definition: {},
          createdByUserId: "user",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const created = await dashboardApi.createStyle({
      companyId: "company",
      name: "Brand",
      definition: {
        logoObjectId: null,
        bodyFont: "Inter",
        headingFont: "Noto Serif",
        bodySizePt: 10,
        headingScale: 1.5,
        italicStyle: "italic",
        colors: {
          text: "#111111",
          heading: "#111111",
          primary: "#111111",
          accent: "#111111",
          muted: "#111111",
        },
        page: {
          size: "A4",
          marginTopMm: 20,
          marginRightMm: 20,
          marginBottomMm: 20,
          marginLeftMm: 20,
        },
        header: {
          enabled: false,
          leftText: "",
          centerText: "",
          rightText: "",
          showPageNumber: false,
        },
        footer: {
          enabled: false,
          leftText: "",
          centerText: "",
          rightText: "",
          showPageNumber: false,
        },
      },
    });

    expect(created.id).toBe("style");
    expect(created.companyId).toBe("company");
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/companies/company/styles");
    const createInit = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(createInit.body as string).not.toContain("workspaceId");
  });
  it("recognizes the server-resolved owner role without accepting a workspace id", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        name: "Studio",
        membership: { role: "owner", userId: "owner" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(dashboardApi.context()).resolves.toEqual({
      name: "Studio",
      userId: "owner",
      role: "owner",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/workspaces/current");
  });
  it("uses server-scoped member management and audit routes", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ items: [] }));
    vi.stubGlobal("fetch", fetcher);

    await dashboardApi.changeMemberRole("user", "owner");
    await dashboardApi.removeMember("user");
    await dashboardApi.audit(50, 25);

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/workspaces/current/members/user",
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "/api/workspaces/current/members/user",
    );
    expect(fetcher.mock.calls[2]?.[0]).toBe(
      "/api/workspaces/current/audit?offset=50&limit=25",
    );
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).method).toBe("PATCH");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
  });
  it("maps inaccessible companies to a safe not-found message", () => {
    expect(
      safeError(new ApiError("not_found", "internal company details")),
    ).toBe("This item is unavailable in your workspace.");
  });
  it("uses private authorized artifact routes rather than public object URLs", () => {
    expect(dashboardApi.pdfUrl("document", 2)).toBe(
      "/api/documents/document/versions/2/pdf",
    );
    expect(dashboardApi.sourceUrl("document", 2)).toBe(
      "/api/documents/document/versions/2/source",
    );
  });
  it("keeps document history as contract versions rather than editable browser content", async () => {
    const versions = [
      {
        id: "version",
        documentId: "document",
        version: 2,
        styleVersionId: "style-version",
        body: "Read only",
        status: "ready",
        inputHash: "a".repeat(64),
        sourceHash: null,
        outputHash: null,
        rendererVersion: null,
        createdByType: "credential",
        createdById: "actor",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          document: {
            id: "document",
            companyId: "company",
            title: "Proposal",
            currentVersionId: "version",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versions,
        }),
      ),
    );
    await expect(dashboardApi.document("document")).resolves.toMatchObject({
      versions,
    });
  });
  it("keeps style versions immutable by posting a new version and activation separately", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetcher);
    await dashboardApi.createStyleVersion(
      "style",
      {
        logoObjectId: null,
        bodyFont: "Inter",
        headingFont: "Noto Serif",
        bodySizePt: 10,
        headingScale: 1.5,
        italicStyle: "italic",
        colors: {
          text: "#111111",
          heading: "#111111",
          primary: "#111111",
          accent: "#111111",
          muted: "#111111",
        },
        page: {
          size: "A4",
          marginTopMm: 20,
          marginRightMm: 20,
          marginBottomMm: 20,
          marginLeftMm: 20,
        },
        header: {
          enabled: false,
          leftText: "",
          centerText: "",
          rightText: "",
          showPageNumber: false,
        },
        footer: {
          enabled: false,
          leftText: "",
          centerText: "",
          rightText: "",
          showPageNumber: false,
        },
      },
      true,
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/styles/style/versions");
    const versionInit = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(versionInit.method).toBe("POST");
  });
});
