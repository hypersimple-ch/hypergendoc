import type { McpAction, WorkspaceRole } from "@hypergendoc/contracts";

export type HumanActor = Readonly<{
  userId: string;
  workspaceId: string;
  membershipId: string;
  role: WorkspaceRole;
  requestId: string;
}>;
export type AgentActor = Readonly<{
  credentialId: string;
  workspaceId: string;
  allowedCompanyIds: readonly string[];
  actions: readonly McpAction[];
  requestId: string;
}>;
export type Actor = HumanActor | AgentActor;

export function isHumanActor(actor: Actor): actor is HumanActor {
  return "userId" in actor;
}
