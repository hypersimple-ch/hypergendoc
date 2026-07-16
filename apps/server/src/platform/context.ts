export type ActorContext =
  | {
      readonly type: "human";
      readonly userId: string;
      readonly workspaceId: string;
      readonly membershipId: string;
      readonly role: "owner" | "member";
      readonly requestId: string;
    }
  | {
      readonly type: "agent";
      readonly credentialId: string;
      readonly workspaceId: string;
      readonly allowedCompanyIds: readonly string[];
      readonly actions: readonly string[];
      readonly requestId: string;
    };

export interface RequestContext {
  readonly requestId: string;
  readonly actor?: ActorContext;
  readonly workspaceId?: string;
}

/** Database boundary: repositories receive this trusted context, never a body workspace id. */
export interface DatabaseTransaction {
  readonly context: RequestContext;
}
export interface Database {
  transaction<T>(
    context: RequestContext,
    run: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
}

export function createRequestContext(
  requestId: string,
  actor?: ActorContext,
): RequestContext {
  return {
    requestId,
    ...(actor === undefined ? {} : { actor, workspaceId: actor.workspaceId }),
  };
}
