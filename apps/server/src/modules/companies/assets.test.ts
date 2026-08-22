import { describe, expect, it, vi } from "vitest";
import type { CompanyAssets } from "@hypergendoc/contracts";
import type { HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";
import {
  createCompanyAssetService,
  type CompanyAssetRepository,
} from "./assets.js";

const actor: HumanActor = {
  userId: "user",
  workspaceId: "workspace-a",
  membershipId: "membership",
  role: "member",
  requestId: "request",
};
const assets: CompanyAssets = {
  logos: [],
  images: [],
  fonts: [
    {
      id: "Inter",
      source: "built_in",
      familyName: "Inter",
      subfamilyName: null,
      displayName: "Inter",
      owned: false,
      contentUrl: null,
    },
  ],
  colors: ["#aabbcc"],
};

describe("company assets", () => {
  it("scopes listing and browser content to the authorized company", async () => {
    const findContent = vi.fn<CompanyAssetRepository["findContent"]>(() =>
      Promise.resolve({
        key: "private/secret",
        sha256: "a".repeat(64),
        byteSize: 4,
        contentType: "font/ttf",
      }),
    );
    const repository: CompanyAssetRepository = {
      list: vi.fn().mockResolvedValue(assets),
      findContent,
      create: vi.fn(),
      createImage: vi.fn(),
    };
    const authorizedGet = vi.fn(
      (input: { authorize: () => Promise<boolean> }) =>
        input.authorize().then((authorized) => {
          expect(authorized).toBe(true);
          return {
            bytes: Buffer.from("font"),
            contentType: "font/ttf",
          };
        }),
    );
    const service = createCompanyAssetService({
      companies: {
        get: (_actor: HumanActor, companyId: string) =>
          companyId === "company-a"
            ? Promise.resolve({})
            : Promise.reject(new AuthorizationError("not_found")),
      } as never,
      repository,
      store: { authorizedGet } as never,
      logoOwnership: { create: vi.fn() },
      audit: { write: () => Promise.resolve() },
      operations: {
        begin: vi.fn(),
        markExternalApplied: vi.fn(),
        requireReconciliation: vi.fn(),
        complete: vi.fn(),
      },
    });
    await expect(service.list(actor, "company-b")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await service.list(actor, "company-a")).toEqual(assets);
    const content = await service.content(
      actor,
      "company-a",
      "font",
      "font-id",
    );
    expect(content.contentType).toBe("font/ttf");
    expect(findContent).toHaveBeenCalledWith(
      "workspace-a",
      "company-a",
      "font",
      "font-id",
    );
    expect(authorizedGet).toHaveBeenCalledOnce();
  });

  it("records a recoverable state when S3 ownership succeeds but audit fails", async () => {
    const calls: string[] = [];
    const repository: CompanyAssetRepository = {
      list: vi.fn().mockResolvedValue(assets),
      findContent: vi.fn(),
      create: vi.fn(),
      createImage: vi.fn().mockImplementation(() => {
        calls.push("ownership");
        return Promise.resolve({ id: "object-id" });
      }),
    };
    const begin = vi.fn().mockImplementation(() => {
      calls.push("journal");
      return Promise.resolve({
        id: "operation-id",
        status: "pending",
        targetId: null,
        replayed: false,
      });
    });
    const markExternalApplied = vi.fn().mockImplementation(() => {
      calls.push("external_applied");
      return Promise.resolve();
    });
    const requireReconciliation = vi.fn().mockResolvedValue(undefined);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const service = createCompanyAssetService({
      companies: { get: () => Promise.resolve({}) } as never,
      repository,
      logoOwnership: { create: vi.fn() },
      store: {
        putPrivate: vi.fn().mockImplementation((input: { key: string }) => {
          calls.push("s3");
          return Promise.resolve({
            key: input.key,
            sha256: "a".repeat(64),
            bytes: png.byteLength,
            contentType: "image/png",
          });
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      } as never,
      audit: { write: () => Promise.reject(new Error("audit unavailable")) },
      operations: {
        begin,
        markExternalApplied,
        requireReconciliation,
        complete: vi.fn(),
      },
    });
    await expect(service.uploadImage(actor, "company-a", png)).rejects.toThrow(
      "audit unavailable",
    );
    expect(calls).toEqual(["journal", "s3", "ownership", "external_applied"]);
    expect(requireReconciliation).toHaveBeenCalledWith(
      "operation-id",
      "s3_mutation_incomplete",
    );
    expect(begin.mock.calls[0]?.[0]).not.toHaveProperty("bytes");
  });
});
