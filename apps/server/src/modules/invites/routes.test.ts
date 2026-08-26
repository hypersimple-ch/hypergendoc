import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerSafeErrorHandler } from "../../platform/errors.js";
import type { RateLimiter } from "../../platform/rate-limit.js";
import type { HumanActor } from "../auth/actors.js";
import { createPublicInviteRoutes, createWorkspaceInviteRoutes } from "./routes.js";
import { createInviteService, InviteError } from "./service.js";

const owner: HumanActor = {
  userId: "owner",
  workspaceId: "workspace",
  membershipId: "owner-membership",
  role: "owner",
  requestId: "request",
};
const member: HumanActor = { ...owner, role: "member" };

type InviteService = ReturnType<typeof createInviteService>;

/** Base service wired against storage that must never be reached in these tests. */
function service(overrides: Partial<InviteService> = {}): InviteService {
  const base = createInviteService({
    repository: {
      transaction: () =>
        Promise.reject(new Error("storage not used in route tests")),
    } as never,
    mailQueue: { enqueue: () => Promise.resolve() },
    appOrigin: "https://app.test",
    signupMode: "open",
  });
  return { ...base, ...overrides };
}

const okLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, retryAfterMs: 0 }),
};
const exhaustedLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: false, retryAfterMs: 60_000 }),
};

const errorBodyOf = (response: { json: () => unknown }): string => {
  const body = response.json() as { error?: { code?: string } };
  return body.error?.code ?? "";
};

describe("workspace invite routes (authenticated)", () => {
  it("creates an invite for owners and returns the one-time link", async () => {
    const invites = service({
      create: (_actor, input) =>
        Promise.resolve({
          invite: {
            id: "invite-1",
            email: input.email,
            role: input.role,
            expiresAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          link: `https://app.test/invite/token-for-${input.email}`,
        }),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createWorkspaceInviteRoutes({
        actorFor: vi.fn().mockReturnValue(owner),
        service: invites,
      }),
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/current/invites",
      payload: { email: "new@example.test", role: "member" },
    });
    expect(created.statusCode).toBe(201);
    const createdBody =
      created.json<{
        invite: { email: string; role: string };
        link: string;
      }>();
    expect(createdBody.invite).toMatchObject({
      email: "new@example.test",
      role: "member",
    });
    expect(createdBody.link).toContain("/invite/");
  });

  it("rejects member actors with 403 on create, list, and revoke", async () => {
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createWorkspaceInviteRoutes({
        actorFor: vi.fn().mockReturnValue(member),
        service: service(),
      }),
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/current/invites",
      payload: { email: "new@example.test", role: "member" },
    });
    expect(created.statusCode).toBe(403);
    expect(errorBodyOf(created)).toBe("forbidden");
    const listed = await app.inject({
      method: "GET",
      url: "/api/workspaces/current/invites",
    });
    expect(listed.statusCode).toBe(403);
    const revoked = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/current/invites/00000000-0000-4000-8000-000000000000",
    });
    expect(revoked.statusCode).toBe(403);
  });

  it("lists pending invites and revokes with 204", async () => {
    const invites = service({
      list: () =>
        Promise.resolve([
          {
            id: "invite-1",
            email: "pending@example.test",
            role: "member",
            expiresAt: new Date(Date.now() + 1000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ]),
      revoke: () => Promise.resolve(),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createWorkspaceInviteRoutes({
        actorFor: vi.fn().mockReturnValue(owner),
        service: invites,
      }),
    );
    const listed = await app.inject({
      method: "GET",
      url: "/api/workspaces/current/invites",
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json<Array<{ email: string }>>();
    expect(listedBody[0]).toMatchObject({ email: "pending@example.test" });
    const revoked = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/current/invites/00000000-0000-4000-8000-000000000001",
    });
    expect(revoked.statusCode).toBe(204);
  });

  it("maps unknown revocations to typed not_found errors", async () => {
    const invites = service({
      revoke: () => Promise.reject(new InviteError("not_found")),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createWorkspaceInviteRoutes({
        actorFor: vi.fn().mockReturnValue(owner),
        service: invites,
      }),
    );
    const missing = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/current/invites/00000000-0000-4000-8000-000000000002",
    });
    expect(missing.statusCode).toBe(404);
    expect(errorBodyOf(missing)).toBe("not_found");
  });
});

describe("public invite routes", () => {
  it("exposes inspect without authentication and returns the accept view", async () => {
    const invites = service({
      inspect: () =>
        Promise.resolve({
          workspaceName: "Acme",
          email: "new@example.test",
          role: "member",
          expiresAt: new Date(Date.now() + 1000).toISOString(),
        }),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({ service: invites, rateLimiter: okLimiter }),
    );
    const view = await app.inject({
      method: "GET",
      url: "/api/invites/valid-token-value",
    });
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      workspaceName: "Acme",
      email: "new@example.test",
    });
  });

  it("accepts an invite without authentication", async () => {
    const invites = service({
      accept: () => Promise.resolve({ workspaceName: "Acme" }),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({ service: invites, rateLimiter: okLimiter }),
    );
    const accepted = await app.inject({
      method: "POST",
      url: "/api/invites/valid-token-value/accept",
      payload: { name: "New Person", password: "long-enough-password" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ workspaceName: "Acme" });
  });

  it("rate-limits public endpoints after repeated hits", async () => {
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({
        service: service(),
        rateLimiter: exhaustedLimiter,
      }),
    );
    const limited = await app.inject({
      method: "GET",
      url: "/api/invites/some-token-value",
    });
    expect(limited.statusCode).toBe(429);
    expect(errorBodyOf(limited)).toBe("rate_limited");
  });

  it("maps gone tokens to 410", async () => {
    const invites = service({
      inspect: () => Promise.reject(new InviteError("gone")),
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({ service: invites, rateLimiter: okLimiter }),
    );
    const expired = await app.inject({
      method: "GET",
      url: "/api/invites/expired-token-value",
    });
    expect(expired.statusCode).toBe(410);
    expect(errorBodyOf(expired)).toBe("gone");
  });

  it("validates the acceptance payload minimums", async () => {
    const accepted: string[] = [];
    const invites = service({
      accept: (_token, input) => {
        accepted.push(input.name);
        return Promise.resolve({ workspaceName: "Acme" });
      },
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({ service: invites, rateLimiter: okLimiter }),
    );
    const weak = await app.inject({
      method: "POST",
      url: "/api/invites/valid-token-value/accept",
      payload: { name: "New Person", password: "short" },
    });
    expect(weak.statusCode).toBe(400);
    expect(errorBodyOf(weak)).toBe("validation_failed");
    expect(accepted).toEqual([]);
  });

  it("rejects closed-mode acceptance with forbidden", async () => {
    const closed = createInviteService({
      repository: {
        transaction: () =>
          Promise.reject(new Error("must not reach storage")),
      } as never,
      mailQueue: { enqueue: () => Promise.resolve() },
      appOrigin: "https://app.test",
      signupMode: "closed",
    });
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createPublicInviteRoutes({ service: closed, rateLimiter: okLimiter }),
    );
    const rejected = await app.inject({
      method: "POST",
      url: "/api/invites/valid-token-value/accept",
      payload: { name: "New Person", password: "long-enough-password" },
    });
    expect(rejected.statusCode).toBe(403);
    expect(errorBodyOf(rejected)).toBe("forbidden");
  });

});
