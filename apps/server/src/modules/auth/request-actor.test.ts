import Fastify, { type FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { HumanActor } from "./actors.js";
import {
  preauthenticatedActor,
  registerHumanActorPreHandler,
} from "./request-actor.js";

function actor(requestId: string): HumanActor {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    membershipId: "membership-1",
    role: "owner",
    requestId,
  };
}

describe("preauthenticated request actor", () => {
  it("resolves auth and membership once for an ordinary protected request", async () => {
    const app = Fastify();
    const resolveActor = vi.fn((request: FastifyRequest) =>
      Promise.resolve(actor(request.id)),
    );
    registerHumanActorPreHandler(app, resolveActor);
    app.get("/api/companies", (request) => ({
      first: preauthenticatedActor(request).membershipId,
      second: preauthenticatedActor(request).membershipId,
    }));

    const response = await app.inject({ method: "GET", url: "/api/companies" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      first: "membership-1",
      second: "membership-1",
    });
    expect(resolveActor).toHaveBeenCalledOnce();
    await app.close();
  });

  it.each(["/api/auth/session", "/api/workspaces"])(
    "preserves the %s authentication exclusion",
    async (url) => {
      const app = Fastify();
      const resolveActor = vi.fn((request: FastifyRequest) =>
        Promise.resolve(actor(request.id)),
      );
      registerHumanActorPreHandler(app, resolveActor);
      app.route({
        method: "GET",
        url,
        handler: (request) => ({ attached: Boolean(request.humanActor) }),
      });

      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ attached: false });
      expect(resolveActor).not.toHaveBeenCalled();
      await app.close();
    },
  );

  it("rejects a missing or wrong request actor", () => {
    const request = { id: "request-1" } as FastifyRequest;
    const wrongActor = {
      id: "request-1",
      humanActor: {
        type: "agent",
        credentialId: "credential-1",
        workspaceId: "workspace-1",
        requestId: "request-1",
      },
    } as unknown as FastifyRequest;

    for (const unsafeRequest of [request, wrongActor])
      expect(() => preauthenticatedActor(unsafeRequest)).toThrow(
        expect.objectContaining({ code: "unauthenticated", statusCode: 401 }),
      );
  });

  it("rejects an actor resolved for a different request", () => {
    const request = {
      id: "request-2",
      humanActor: actor("request-1"),
    } as FastifyRequest;

    expect(() => preauthenticatedActor(request)).toThrow(
      expect.objectContaining({ code: "unauthenticated", statusCode: 401 }),
    );
  });
});
