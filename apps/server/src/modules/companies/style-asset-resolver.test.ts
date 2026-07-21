import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { StyleDefinition } from "@hypergendoc/contracts";
import type { ObjectStore } from "../../platform/object-store.js";
import type { CompanyAssetRepository } from "./assets.js";
import { createCompanyStyleAssetResolver } from "./style-asset-resolver.js";

const logoId = "00000000-0000-4000-8000-000000000001";
const fontId = "00000000-0000-4000-8000-000000000002";
const bytes = Buffer.from("asset bytes");
const hash = createHash("sha256").update(bytes).digest("hex");
const definition: StyleDefinition = {
  assetVersion: 1,
  logoObjectId: logoId,
  bodyFont: fontId,
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.4,
  italicStyle: "italic",
  colors: {
    text: "#17201c",
    heading: "#17201c",
    primary: "#a33b20",
    accent: "#276f62",
    muted: "#767b76",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 18,
    marginBottomMm: 20,
    marginLeftMm: 18,
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
};

const record = (kind: "logo" | "font") => ({
  key: `private/${kind}`,
  sha256: hash,
  byteSize: bytes.byteLength,
  contentType: kind === "logo" ? "image/png" : "font/woff2",
});

describe("company style asset resolver", () => {
  it("returns verified company assets for canonical rendering", async () => {
    const findContent = vi.fn<CompanyAssetRepository["findContent"]>(
      (_workspace, _company, kind) => Promise.resolve(record(kind)),
    );
    const authorizedGet = vi.fn<ObjectStore["authorizedGet"]>(
      async ({ key, authorize }) => {
        expect(await authorize()).toBe(true);
        return {
          bytes,
          contentType: key.endsWith("logo") ? "image/png" : "font/woff2",
        };
      },
    );
    const resolver = createCompanyStyleAssetResolver(
      { findContent },
      { authorizedGet },
    );

    const result = await resolver.resolve(
      "workspace-a",
      "company-a",
      definition,
    );
    expect(result).toEqual({
      logo: {
        id: logoId,
        contentType: "image/png",
        byteSize: bytes.byteLength,
        sha256: hash,
        base64: bytes.toString("base64"),
      },
      fonts: [
        {
          id: fontId,
          contentType: "font/woff2",
          byteSize: bytes.byteLength,
          sha256: hash,
          base64: bytes.toString("base64"),
        },
      ],
    });
    expect(findContent).toHaveBeenCalledWith(
      "workspace-a",
      "company-a",
      "font",
      fontId,
    );
  });

  it("does not resolve assets for immutable legacy definitions", async () => {
    const findContent = vi.fn<CompanyAssetRepository["findContent"]>();
    const resolver = createCompanyStyleAssetResolver(
      { findContent },
      { authorizedGet: vi.fn<ObjectStore["authorizedGet"]>() },
    );
    await expect(
      resolver.resolve("workspace-a", "company-a", {
        ...definition,
        assetVersion: undefined,
        logoObjectId: logoId,
        bodyFont: "Inter",
      }),
    ).resolves.toEqual({ logo: null, fonts: [] });
    expect(findContent).not.toHaveBeenCalled();
  });

  it("rejects missing, cross-company, or modified private objects", async () => {
    const missing = createCompanyStyleAssetResolver(
      {
        findContent: vi
          .fn<CompanyAssetRepository["findContent"]>()
          .mockResolvedValue(undefined),
      },
      { authorizedGet: vi.fn<ObjectStore["authorizedGet"]>() },
    );
    await expect(
      missing.resolve("workspace-a", "company-b", definition),
    ).rejects.toMatchObject({ code: "render_rejected", statusCode: 422 });

    const modified = createCompanyStyleAssetResolver(
      {
        findContent: vi
          .fn<CompanyAssetRepository["findContent"]>()
          .mockResolvedValue(record("logo")),
      },
      {
        authorizedGet: vi.fn<ObjectStore["authorizedGet"]>().mockResolvedValue({
          bytes: Buffer.from("modified"),
          contentType: "image/png",
        }),
      },
    );
    await expect(
      modified.resolve("workspace-a", "company-a", {
        ...definition,
        bodyFont: "Inter",
      }),
    ).rejects.toMatchObject({ code: "render_rejected", statusCode: 422 });
  });
});
