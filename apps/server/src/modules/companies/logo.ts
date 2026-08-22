import { createHash } from "node:crypto";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type {
  LogoOwnershipRepository,
  LogoUploadResult,
} from "../../platform/logo-upload.js";
import { uploadLogo } from "../../platform/logo-upload.js";
import type { ObjectStore } from "../../platform/object-store.js";
import type { MutationOperationJournal } from "../../platform/mutation-operations.js";
import type { HumanActor } from "../auth/actors.js";
import type { createCompanyService } from "./service.js";

export function createCompanyLogoService(deps: {
  companies: ReturnType<typeof createCompanyService>;
  store: ObjectStore;
  ownership: LogoOwnershipRepository;
  audit: AuditWriter;
  operations: Pick<
    MutationOperationJournal,
    "begin" | "markExternalApplied" | "requireReconciliation" | "complete"
  >;
}) {
  return {
    async upload(
      actor: HumanActor,
      companyId: string,
      bytes: Uint8Array,
    ): Promise<LogoUploadResult> {
      // Resolving first makes a foreign company indistinguishable from an absent one.
      await deps.companies.get(actor, companyId);
      const objectKey = `private/${createHash("sha256")
        .update(`${actor.workspaceId}:company.logo_uploaded:${actor.requestId}`)
        .digest("hex")}`;
      const operation = await deps.operations.begin({
        workspaceId: actor.workspaceId,
        idempotencyKey: `company.logo_uploaded:${actor.requestId}`,
        operationType: "company.logo_uploaded",
        targetType: "stored_object",
        externalReference: objectKey,
      });
      if (operation.replayed) throw new Error("mutation idempotency conflict");
      try {
        const logo = await uploadLogo(
          { workspaceId: actor.workspaceId, companyId, bytes, objectKey },
          deps.store,
          deps.ownership,
        );
        await deps.operations.markExternalApplied(operation.id, {
          targetId: logo.id,
        });
        await deps.audit.write({
          workspaceId: actor.workspaceId,
          requestId: actor.requestId,
          event: "company.logo_uploaded",
          ...auditActor({ type: "human", ...actor }),
          targetType: "stored_object",
          targetId: logo.id,
          outcome: "success",
        });
        await deps.operations.complete(operation.id);
        return logo;
      } catch (error) {
        await deps.operations.requireReconciliation(
          operation.id,
          "s3_mutation_incomplete",
        );
        throw error;
      }
    },
  };
}
