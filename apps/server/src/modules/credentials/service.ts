import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { McpAction, McpCredential } from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import { auditActor } from "../../platform/audit.js";
import type { AgentActor, HumanActor } from "../auth/actors.js";
import { AuthorizationError, requireOwner } from "../memberships/service.js";

export interface CreateMcpCredentialInput {
  readonly name: string;
  readonly companyIds: readonly string[];
  readonly actions: readonly McpAction[];
  readonly expiresAt?: string | undefined;
}
export interface CredentialRecord extends McpCredential {
  readonly tokenHash: string;
}
export interface CredentialRepository {
  transaction<T>(
    operation: (repository: CredentialOperations) => Promise<T>,
  ): Promise<T>;
  companiesExist(
    workspaceId: string,
    companyIds: readonly string[],
  ): Promise<boolean>;
  insert(
    input: Readonly<{
      workspaceId: string;
      name: string;
      lookupPrefix: string;
      tokenHash: string;
      companyIds: readonly string[];
      actions: readonly McpAction[];
      expiresAt: Date | null;
      createdByUserId: string;
    }>,
  ): Promise<McpCredential>;
  list(workspaceId: string): Promise<readonly McpCredential[]>;
  findByLookupPrefix(
    lookupPrefix: string,
  ): Promise<CredentialRecord | undefined>;
  find(
    workspaceId: string,
    credentialId: string,
  ): Promise<McpCredential | undefined>;
  replaceScopes(
    input: Readonly<{
      workspaceId: string;
      credentialId: string;
      companyIds: readonly string[];
      actions: readonly McpAction[];
      expiresAt: Date | null;
    }>,
  ): Promise<McpCredential | undefined>;
  revoke(
    workspaceId: string,
    credentialId: string,
    revokedAt: Date,
  ): Promise<boolean>;
  touchLastUsed(
    workspaceId: string,
    credentialId: string,
    usedAt: Date,
  ): Promise<void>;
}
export type CredentialOperations = Omit<CredentialRepository, "transaction">;

const tokenHash = (pepper: string, token: string) =>
  createHmac("sha256", pepper).update(token).digest();
const tokenParts = (token: string) => {
  const match = /^hgd_([A-Za-z0-9_-]{6,32})_([A-Za-z0-9_-]{43,})$/.exec(token);
  return match ? { lookupPrefix: match[1]! } : undefined;
};
function safeHashMatch(actualHex: string, expected: Buffer): boolean {
  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createCredentialService(deps: {
  repository: CredentialRepository;
  audit: AuditWriter;
  pepper: string;
  now?: () => Date;
}) {
  if (!deps.pepper) throw new Error("credential pepper is required");
  const now = deps.now ?? (() => new Date());
  const emit = (
    actor: HumanActor | AgentActor,
    event: string,
    targetId: string,
  ) =>
    deps.audit.write({
      workspaceId: actor.workspaceId,
      requestId: actor.requestId,
      event,
      ...auditActor(
        "userId" in actor
          ? { type: "human", ...actor }
          : { type: "agent", ...actor },
      ),
      targetType: "mcp_credential",
      targetId,
      outcome: "success",
    });
  async function validateScopes(
    workspaceId: string,
    companyIds: readonly string[],
  ) {
    if (!(await deps.repository.companiesExist(workspaceId, companyIds)))
      throw new AuthorizationError("not_found");
  }
  return {
    async create(
      actor: HumanActor,
      input: CreateMcpCredentialInput,
    ): Promise<{ credential: McpCredential; token: string }> {
      requireOwner(actor);
      await validateScopes(actor.workspaceId, input.companyIds);
      if (input.expiresAt && new Date(input.expiresAt) <= now())
        throw new AuthorizationError("conflict");
      // 32 random bytes = 256 bits; neither secret nor complete token reaches storage/audit.
      const lookupPrefix = randomBytes(9).toString("base64url");
      const token = `hgd_${lookupPrefix}_${randomBytes(32).toString("base64url")}`;
      const credential = await deps.repository.transaction((repository) =>
        repository.insert({
          workspaceId: actor.workspaceId,
          name: input.name,
          lookupPrefix,
          tokenHash: tokenHash(deps.pepper, token).toString("hex"),
          companyIds: input.companyIds,
          actions: input.actions,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByUserId: actor.userId,
        }),
      );
      await emit(actor, "mcp_credential.created", credential.id);
      return { credential, token };
    },
    list(actor: HumanActor) {
      requireOwner(actor);
      return deps.repository.list(actor.workspaceId);
    },
    async replaceScopes(
      actor: HumanActor,
      credentialId: string,
      input: Readonly<{
        companyIds: readonly string[];
        actions: readonly McpAction[];
        expiresAt: Date | null;
      }>,
    ) {
      requireOwner(actor);
      await validateScopes(actor.workspaceId, input.companyIds);
      const credential = await deps.repository.transaction((repository) =>
        repository.replaceScopes({
          workspaceId: actor.workspaceId,
          credentialId,
          ...input,
        }),
      );
      if (!credential) throw new AuthorizationError("not_found");
      await emit(actor, "mcp_credential.scopes_updated", credentialId);
      return credential;
    },
    async revoke(actor: HumanActor, credentialId: string): Promise<void> {
      requireOwner(actor);
      if (
        !(await deps.repository.revoke(actor.workspaceId, credentialId, now()))
      )
        throw new AuthorizationError("not_found");
      await emit(actor, "mcp_credential.revoked", credentialId);
    },
    /** Deliberately re-reads storage on every call: revocation/scope changes apply next request. */
    async verify(token: string, requestId: string): Promise<AgentActor> {
      const parts = tokenParts(token);
      if (!parts) throw new AuthorizationError("forbidden");
      const credential = await deps.repository.findByLookupPrefix(
        parts.lookupPrefix,
      );
      if (
        !credential ||
        !safeHashMatch(credential.tokenHash, tokenHash(deps.pepper, token)) ||
        credential.revokedAt ||
        (credential.expiresAt && new Date(credential.expiresAt) <= now())
      )
        throw new AuthorizationError("forbidden");
      await deps.repository.touchLastUsed(
        credential.workspaceId,
        credential.id,
        now(),
      );
      const actor: AgentActor = {
        credentialId: credential.id,
        workspaceId: credential.workspaceId,
        allowedCompanyIds: credential.companyIds,
        actions: credential.actions,
        requestId,
      };
      await emit(actor, "mcp_credential.used", credential.id);
      return actor;
    },
  };
}
