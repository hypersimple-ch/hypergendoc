import { auditEvents, type Database } from "@hypergendoc/db";
import type { ActorContext } from "./context.js";

export interface AuditEvent {
  readonly workspaceId: string;
  readonly requestId: string;
  readonly event: string;
  readonly actorType: "user" | "credential" | "system";
  readonly actorId: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly outcome: "success" | "failure";
  readonly metadata?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}
export interface AuditWriter {
  write(event: AuditEvent): Promise<void>;
}
export interface AuditEventRepository {
  insert(event: AuditEvent): Promise<void>;
}
export function createAuditWriter(
  repository: AuditEventRepository,
): AuditWriter {
  return { write: (event) => repository.insert(event) };
}

/** Creates an audit writer bound to this exact Drizzle database or transaction. */
export function createTransactionAuditWriter(
  db: Pick<Database, "insert">,
): AuditWriter {
  return {
    async write(event) {
      await db.insert(auditEvents).values({
        workspaceId: event.workspaceId,
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.event,
        targetType: event.targetType,
        targetId: event.targetId,
        requestId: event.requestId,
        outcome: event.outcome,
        metadata: event.metadata ?? {},
      });
    },
  };
}
export function auditActor(
  actor: ActorContext | undefined,
): Pick<AuditEvent, "actorType" | "actorId"> {
  if (actor?.type === "human")
    return { actorType: "user", actorId: actor.userId };
  if (actor?.type === "agent")
    return { actorType: "credential", actorId: actor.credentialId };
  return { actorType: "system", actorId: null };
}
