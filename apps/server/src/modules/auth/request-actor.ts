import type { WorkspaceRole } from "@hypergendoc/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../../platform/errors.js";
import type { HumanActor } from "./actors.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set only by the global protected-API pre-handler. */
    humanActor?: HumanActor;
  }
}

export type PreauthenticatedActor = (request: FastifyRequest) => HumanActor;
export type HumanActorResolver = (
  request: FastifyRequest,
) => Promise<HumanActor>;

function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return role === "owner" || role === "member";
}

function isHumanActor(actor: unknown): actor is HumanActor {
  if (typeof actor !== "object" || actor === null) return false;
  const candidate = actor as Partial<Record<keyof HumanActor, unknown>>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.membershipId === "string" &&
    isWorkspaceRole(candidate.role) &&
    typeof candidate.requestId === "string"
  );
}

/** Read the actor established by the global pre-handler. Never authenticates. */
export const preauthenticatedActor: PreauthenticatedActor = (request) => {
  if (
    !isHumanActor(request.humanActor) ||
    request.humanActor.requestId !== request.id
  )
    throw new AppError("unauthenticated", 401);
  return request.humanActor;
};

export function requiresHumanActor(url: string): boolean {
  return (
    url.startsWith("/api/") &&
    !url.startsWith("/api/auth/") &&
    url !== "/api/workspaces"
  );
}

/** Register the single authentication boundary for protected HTTP API routes. */
export function registerHumanActorPreHandler(
  app: FastifyInstance,
  resolveActor: HumanActorResolver,
): void {
  app.decorateRequest("humanActor");
  app.addHook("preHandler", async (request) => {
    if (!requiresHumanActor(request.url)) return;
    request.humanActor = await resolveActor(request);
  });
}
