import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { HumanActor } from "../auth/actors.js";
import { argon2idOptions } from "../auth/better-auth.js";
import { requireOwner } from "../memberships/service.js";
import type { EnqueueMail, MailJobRepository } from "../auth/mail-queue.js";
import type { InviteRepository } from "./repository.js";

import { InviteError } from "./invite-error.js";

export { InviteError };

export interface InviteSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
  createdAt: string;
}
export interface InviteCreation {
  invite: InviteSummary;
  /** The raw token appears exactly once, in this response. */
  link: string;
}
export interface InvitePublicView {
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateInviteInput {
  readonly email: string;
  readonly role: WorkspaceRole;
}
export interface AcceptInviteInput {
  readonly name: string;
  readonly password: string;
}

export type SignupMode = "open" | "invite" | "closed";

interface InviteRecordLike {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  workspaceName?: string;
}

const summary = (record: InviteRecordLike): InviteSummary => ({
  id: record.id,
  email: record.email,
  role: record.role,
  expiresAt: record.expiresAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
});

/**
 * Owner-side invitation management plus the public inspect/accept flow.
 * Only the sha256 token hash is persisted; the raw token lives exactly once
 * in the creation response and in the queued invitation mail.
 */
export function createInviteService(deps: {
  repository: InviteRepository;
  mailQueue: Pick<MailJobRepository, "enqueue">;
  appOrigin: string;
  signupMode: SignupMode;
  now?: () => Date;
}) {
  if (!deps.appOrigin) throw new Error("app origin is required");
  const now = deps.now ?? (() => new Date());

  async function pendingByToken(rawToken: string) {
    const record = await deps.repository.transaction((operations) =>
      operations.findByTokenHash(hashInviteToken(rawToken)),
    );
    return record;
  }

  return {
    async create(
      actor: HumanActor,
      input: CreateInviteInput,
    ): Promise<InviteCreation> {
      requireOwner(actor);
      const email = input.email.toLowerCase();
      const rawToken = randomBytes(32).toString("base64url");
      const record = await deps.repository.transaction(
        async (operations, audit) => {
          if (await operations.findPending(actor.workspaceId, email))
            throw new InviteError("conflict");
          if (await operations.findUserIdByEmail(email))
            throw new InviteError("conflict");
          const inserted = await operations.insert({
            workspaceId: actor.workspaceId,
            email,
            role: input.role,
            tokenHash: hashInviteToken(rawToken),
            createdBy: actor.userId,
            expiresAt: new Date(now().getTime() + INVITE_TTL_MS),
          });
          await audit.write({
            workspaceId: actor.workspaceId,
            requestId: actor.requestId,
            event: "workspace_invite.created",
            actorType: "user",
            actorId: actor.userId,
            targetType: "workspace_invite",
            targetId: inserted.id,
            outcome: "success",
            metadata: { role: inserted.role },
          });
          return inserted;
        },
      );
      // Queued only after commit so recovery flows see a consistent invite row.
      await deps.mailQueue.enqueue({
        kind: "workspace_invite",
        recipient: email,
        recipientName: email,
        url: `${deps.appOrigin}/invite/${rawToken}`,
      } satisfies EnqueueMail);
      return {
        invite: summary(record),
        link: `${deps.appOrigin}/invite/${rawToken}`,
      };
    },

    async list(actor: HumanActor): Promise<InviteSummary[]> {
      requireOwner(actor);
      const rows = await deps.repository.transaction((operations) =>
        operations.listPending(actor.workspaceId),
      );
      return rows.map(summary);
    },

    async revoke(actor: HumanActor, inviteId: string): Promise<void> {
      requireOwner(actor);
      await deps.repository.transaction(async (operations, audit) => {
        const removed = await operations.deletePending(
          actor.workspaceId,
          inviteId,
        );
        if (!removed) throw new InviteError("not_found");
        await audit.write({
          workspaceId: actor.workspaceId,
          requestId: actor.requestId,
          event: "workspace_invite.revoked",
          actorType: "user",
          actorId: actor.userId,
          targetType: "workspace_invite",
          targetId: inviteId,
          outcome: "success",
        });
      });
    },

    /** Public pre-acceptance lookup for the accept page. */
    async inspect(rawToken: string): Promise<InvitePublicView> {
      const record = await pendingByToken(rawToken);
      if (!record) throw new InviteError("not_found");
      if (record.acceptedAt || record.expiresAt.getTime() <= now().getTime())
        throw new InviteError("gone");
      return {
        workspaceName: record.workspaceName ?? "",
        email: record.email,
        role: record.role,
        expiresAt: record.expiresAt.toISOString(),
      };
    },

    /**
     * Accepts a pending invite by creating a verified account and workspace
     * membership. Works in open and invite modes; closed rejects everything.
     */
    async accept(
      rawToken: string,
      input: AcceptInviteInput,
    ): Promise<{ workspaceName: string }> {
      if (deps.signupMode === "closed") throw new InviteError("forbidden");
      const acceptedAt = now();
      const passwordHash = await hash(input.password, argon2idOptions);
      return deps.repository.transaction(async (operations, audit) => {
        const record = await operations.findByTokenHash(
          hashInviteToken(rawToken),
        );
        if (!record) throw new InviteError("not_found");
        if (record.acceptedAt || record.expiresAt.getTime() <= acceptedAt.getTime())
          throw new InviteError("gone");
        if (await operations.findUserIdByEmail(record.email))
          throw new InviteError("conflict");
        const userId = randomUUID();
        await operations.insertUser({
          id: userId,
          name: input.name.trim(),
          email: record.email,
          passwordHash,
        });
        const membership = await operations.insertMembership({
          workspaceId: record.workspaceId,
          userId,
          role: record.role,
        });
        await operations.markAccepted(record.id, acceptedAt);
        await audit.write({
          workspaceId: record.workspaceId,
          requestId: `invite-${record.id}`,
          event: "membership.added",
          actorType: "system",
          actorId: null,
          targetType: "membership",
          targetId: membership.id,
          outcome: "success",
          metadata: { role: record.role, via: "workspace_invite" },
        });
        await audit.write({
          workspaceId: record.workspaceId,
          requestId: `invite-${record.id}`,
          event: "workspace_invite.accepted",
          actorType: "system",
          actorId: null,
          targetType: "workspace_invite",
          targetId: record.id,
          outcome: "success",
        });
        return { workspaceName: record.workspaceName ?? "" };
      });
    },
  };
}

