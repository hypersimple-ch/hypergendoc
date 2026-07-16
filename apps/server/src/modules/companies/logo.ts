import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type {
  LogoOwnershipRepository,
  LogoUploadResult,
} from "../../platform/logo-upload.js";
import { uploadLogo } from "../../platform/logo-upload.js";
import type { ObjectStore } from "../../platform/object-store.js";
import type { HumanActor } from "../auth/actors.js";
import type { createCompanyService } from "./service.js";

export function createCompanyLogoService(deps: {
  companies: ReturnType<typeof createCompanyService>;
  store: ObjectStore;
  ownership: LogoOwnershipRepository;
  audit: AuditWriter;
}) {
  return {
    async upload(
      actor: HumanActor,
      companyId: string,
      bytes: Uint8Array,
    ): Promise<LogoUploadResult> {
      // Resolving first makes a foreign company indistinguishable from an absent one.
      await deps.companies.get(actor, companyId);
      const logo = await uploadLogo(
        { workspaceId: actor.workspaceId, companyId, bytes },
        deps.store,
        deps.ownership,
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
  };
}
