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
});
