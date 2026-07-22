import { limits } from "@hypergendoc/config";
import {
  FontFamilySchema,
  type ResolvedFontAsset,
  type ResolvedLogoAsset,
  type ResolvedStyleAssets,
} from "@hypergendoc/contracts";
import type { StyleAssetResolver } from "../documents/service-types.js";
import { AppError } from "../../platform/errors.js";
import type { ObjectStore } from "../../platform/object-store.js";
import { sha256 } from "../../platform/object-store.js";
import type { CompanyAssetRepository } from "./assets.js";

const rejected = (): never => {
  throw new AppError("render_rejected", 422);
};

/** Resolves only immutable objects already proven to belong to the style company. */
export function createCompanyStyleAssetResolver(
  repository: Pick<CompanyAssetRepository, "findContent">,
  store: Pick<ObjectStore, "authorizedGet">,
): StyleAssetResolver {
  async function resolveObject(
    workspaceId: string,
    companyId: string,
    kind: "logo" | "font",
    id: string,
  ) {
    const record = await repository.findContent(
      workspaceId,
      companyId,
      kind,
      id,
    );
    if (!record) return rejected();
    const content = await store.authorizedGet({
      key: record.key,
      authorize: async () =>
        Boolean(await repository.findContent(workspaceId, companyId, kind, id)),
    });
    if (
      content.contentType !== record.contentType ||
      content.bytes.byteLength !== record.byteSize ||
      sha256(content.bytes) !== record.sha256
    )
      rejected();
    return {
      id,
      contentType: record.contentType,
      byteSize: record.byteSize,
      sha256: record.sha256,
      base64: Buffer.from(content.bytes).toString("base64"),
    };
  }

  return {
    async resolve(workspaceId, companyId, style): Promise<ResolvedStyleAssets> {
      if (style.assetVersion !== 1) return { logo: null, fonts: [] };
      let totalBytes = 0;
      let logo: ResolvedLogoAsset | null = null;
      if (style.logoObjectId) {
        logo = await resolveObject(
          workspaceId,
          companyId,
          "logo",
          style.logoObjectId,
        );
        totalBytes += logo.byteSize;
      }

      const customFontIds = new Set(
        [
          style.bodyFont,
          style.headingFont,
          ...Object.values(style.textStyles ?? {}).flatMap((textStyle) =>
            textStyle ? [textStyle.fontFamily] : [],
          ),
        ].filter((reference) => !FontFamilySchema.safeParse(reference).success),
      );
      const fonts: ResolvedFontAsset[] = [];
      for (const id of [...customFontIds].sort()) {
        const font = await resolveObject(workspaceId, companyId, "font", id);
        totalBytes += font.byteSize;
        if (totalBytes > limits.renderAssetBytes) rejected();
        fonts.push(font);
      }
      return { logo, fonts };
    },
  };
}
