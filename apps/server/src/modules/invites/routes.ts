import {
  AcceptInviteInputSchema,
  CreateWorkspaceInviteInputSchema,
} from "@hypergendoc/contracts";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../platform/errors.js";
import type { RateLimiter } from "../../platform/rate-limit.js";
import type { PreauthenticatedActor } from "../auth/request-actor.js";
import type { createInviteService } from "./service.js";

const InviteParamsSchema = z.object({
  token: z.string().min(16).max(128),
});
const RevokeParamsSchema = z.object({ inviteId: z.string().uuid() });

export interface WorkspaceInviteRouteDependencies {
  readonly actorFor: PreauthenticatedActor;
  readonly service: ReturnType<typeof createInviteService>;
}

/** Owner-only invitation management under the current workspace. */
export function createWorkspaceInviteRoutes(
  deps: WorkspaceInviteRouteDependencies,
): FastifyPluginAsync {
  return (app) => {
    app.post("/api/workspaces/current/invites", async (request, reply) => {
      const input = CreateWorkspaceInviteInputSchema.parse(request.body);
      const creation = await deps.service.create(
        deps.actorFor(request),
        input,
      );
      return reply.code(201).send(creation);
    });
    app.get("/api/workspaces/current/invites", async (request) =>
      deps.service.list(deps.actorFor(request)),
    );
    app.delete<{ Params: { inviteId: string } }>(
      "/api/workspaces/current/invites/:inviteId",
      async (request, reply) => {
        const { inviteId } = RevokeParamsSchema.parse(request.params);
        await deps.service.revoke(deps.actorFor(request), inviteId);
        return reply.code(204).send();
      },
    );
    return Promise.resolve();
  };
}

const PUBLIC_INVITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

async function consumePublicRateLimit(
  rateLimiter: RateLimiter,
  ip: string | undefined,
  scope: string,
): Promise<void> {
  const result = await rateLimiter.consume({
    key: `invite:${scope}:${ip ?? "unknown"}`,
    limit: PUBLIC_INVITE_RATE_LIMIT.limit,
    windowMs: PUBLIC_INVITE_RATE_LIMIT.windowMs,
  });
  if (!allowed(result)) throw new AppError("rate_limited", 429);
}
function allowed(result: { allowed: boolean }): boolean {
  return result.allowed;
}

/** Public, rate-limited endpoints backing the /invite/<token> accept page. */
export function createPublicInviteRoutes(deps: {
  readonly service: ReturnType<typeof createInviteService>;
  readonly rateLimiter: RateLimiter;
}): FastifyPluginAsync {
  return (app) => {
    app.get<{ Params: { token: string } }>(
      "/api/invites/:token",
      async (request) => {
        await consumePublicRateLimit(deps.rateLimiter, request.ip, "inspect");
        const { token } = InviteParamsSchema.parse(request.params);
        return deps.service.inspect(token);
      },
    );
    app.post<{ Params: { token: string } }>(
      "/api/invites/:token/accept",
      async (request) => {
        await consumePublicRateLimit(deps.rateLimiter, request.ip, "accept");
        const { token } = InviteParamsSchema.parse(request.params);
        const input = AcceptInviteInputSchema.parse(request.body);
        return deps.service.accept(token, input);
      },
    );
    return Promise.resolve();
  };
}
