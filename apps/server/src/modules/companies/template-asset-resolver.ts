import { limits } from "@hypergendoc/config";
import type { ResolvedTemplateAssets } from "@hypergendoc/contracts";
import type { ObjectStore } from "../../platform/object-store.js";
import { sha256 } from "../../platform/object-store.js";
import { AppError } from "../../platform/errors.js";
import type { CompanyAssetRepository } from "./assets.js";

const rejected = (): never => {
  throw new AppError("render_rejected", 422);
};
export function createCompanyTemplateAssetResolver(
  repository: Pick<CompanyAssetRepository, "findContent">,
  store: Pick<ObjectStore, "authorizedGet">,
) {
  return {
    async resolve(
      workspaceId: string,
      companyId: string,
      ids: readonly string[],
    ): Promise<ResolvedTemplateAssets> {
      const images = [];
      let total = 0;
      for (const id of [...new Set(ids)].sort()) {
        const record = await repository.findContent(
          workspaceId,
          companyId,
          "image",
          id,
        );
        if (!record) return rejected();
        const content = await store.authorizedGet({
          key: record.key,
          authorize: async () =>
            Boolean(
              await repository.findContent(workspaceId, companyId, "image", id),
            ),
        });
        if (
          content.contentType !== record.contentType ||
          content.bytes.byteLength !== record.byteSize ||
          sha256(content.bytes) !== record.sha256
        )
          rejected();
        total += record.byteSize;
        if (total > limits.renderAssetBytes) rejected();
        images.push({
          id,
          contentType: record.contentType,
          byteSize: record.byteSize,
          sha256: record.sha256,
          base64: Buffer.from(content.bytes).toString("base64"),
        });
      }
      return { images };
    },
  };
}
