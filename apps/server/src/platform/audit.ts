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
export function auditActor(
  actor: ActorContext | undefined,
): Pick<AuditEvent, "actorType" | "actorId"> {
  if (actor?.type === "human")
    return { actorType: "user", actorId: actor.userId };
  if (actor?.type === "agent")
    return { actorType: "credential", actorId: actor.credentialId };
  return { actorType: "system", actorId: null };
}
