import type {
  CompanyAssets,
  CompanyFontAsset,
  CompanyImageAsset,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type {
  FontOwnershipRepository,
  FontUploadResult,
} from "../../platform/font-upload.js";
import { uploadFont } from "../../platform/font-upload.js";
import type { LogoOwnershipRepository } from "../../platform/logo-upload.js";
import { uploadLogo } from "../../platform/logo-upload.js";
import {
  uploadImage,
  type ImageOwnershipRepository,
} from "../../platform/media-upload.js";
import type { ObjectStore } from "../../platform/object-store.js";
import type { HumanActor } from "../auth/actors.js";
import { AuthorizationError } from "../memberships/service.js";
import type { createCompanyService } from "./service.js";

export interface CompanyAssetRepository
  extends FontOwnershipRepository, ImageOwnershipRepository {
  list(workspaceId: string, companyId: string): Promise<CompanyAssets>;
  findContent(
    workspaceId: string,
    companyId: string,
    kind: "logo" | "font" | "image",
    objectId: string,
  ): Promise<
    | Readonly<{
        key: string;
        sha256: string;
        byteSize: number;
        contentType: string;
      }>
    | undefined
  >;
}

export function createCompanyAssetService(deps: {
  companies: ReturnType<typeof createCompanyService>;
  repository: CompanyAssetRepository;
  store: ObjectStore;
  logoOwnership: LogoOwnershipRepository;
  audit: AuditWriter;
}) {
  async function company(actor: HumanActor, companyId: string) {
    await deps.companies.get(actor, companyId);
  }
  return {
    async list(actor: HumanActor, companyId: string): Promise<CompanyAssets> {
      await company(actor, companyId);
      return deps.repository.list(actor.workspaceId, companyId);
    },
    async uploadLogo(actor: HumanActor, companyId: string, bytes: Uint8Array) {
      await company(actor, companyId);
      const logo = await uploadLogo(
        { workspaceId: actor.workspaceId, companyId, bytes },
        deps.store,
        deps.logoOwnership,
      );
      await deps.audit.write({
        workspaceId: actor.workspaceId,
        requestId: actor.requestId,
        event: "company.logo_uploaded",
        ...auditActor({ type: "human", ...actor }),
        targetType: "stored_object",
        targetId: logo.id,
        outcome: "success",
      });
      return logo;
    },
    async uploadImage(
      actor: HumanActor,
      companyId: string,
      bytes: Uint8Array,
      displayName?: string,
    ): Promise<CompanyImageAsset> {
      await company(actor, companyId);
      const image = await uploadImage(
        {
          workspaceId: actor.workspaceId,
          companyId,
          bytes,
          ...(displayName ? { displayName } : {}),
        },
        deps.store,
        deps.repository,
      );
      await deps.audit.write({
        workspaceId: actor.workspaceId,
        requestId: actor.requestId,
        event: "company.image_uploaded",
        ...auditActor({ type: "human", ...actor }),
        targetType: "stored_object",
        targetId: image.id,
        outcome: "success",
      });
      return {
        id: image.id,
        displayName: displayName ?? null,
        contentType: image.contentType as
          "image/png" | "image/jpeg" | "image/webp",
        byteSize: image.bytes,
        contentUrl: `/api/companies/${companyId}/assets/images/${image.id}/content`,
        createdAt: new Date().toISOString(),
      };
    },
    async uploadFont(
      actor: HumanActor,
      companyId: string,
      bytes: Uint8Array,
    ): Promise<CompanyFontAsset> {
      await company(actor, companyId);
      const font: FontUploadResult = await uploadFont(
        { workspaceId: actor.workspaceId, companyId, bytes },
        deps.store,
        deps.repository,
      );
      await deps.audit.write({
        workspaceId: actor.workspaceId,
        requestId: actor.requestId,
        event: "company.font_uploaded",
        ...auditActor({ type: "human", ...actor }),
        targetType: "stored_object",
        targetId: font.id,
        outcome: "success",
      });
      return {
        id: font.id,
        source: "uploaded",
        familyName: font.familyName,
        subfamilyName: font.subfamilyName,
        displayName: font.displayName,
        owned: true,
        contentUrl: `/api/companies/${companyId}/assets/fonts/${font.id}/content`,
      };
    },
    async content(
      actor: HumanActor,
      companyId: string,
      kind: "logo" | "font" | "image",
      objectId: string,
    ) {
      await company(actor, companyId);
      const object = await deps.repository.findContent(
        actor.workspaceId,
        companyId,
        kind,
        objectId,
      );
      if (!object) throw new AuthorizationError("not_found");
      return deps.store.authorizedGet({
        key: object.key,
        authorize: async () =>
          Boolean(
            await deps.repository.findContent(
              actor.workspaceId,
              companyId,
              kind,
              objectId,
            ),
          ),
      });
    },
  };
}
