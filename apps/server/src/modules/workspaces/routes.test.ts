import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { HumanActor } from "../auth/actors.js";
import { createWorkspaceReadRoutes } from "./routes.js";
import { createWorkspaceReadService } from "./service.js";

const actor: HumanActor = {
  userId: "user",
  workspaceId: "workspace",
  membershipId: "membership",
  role: "owner",
  requestId: "request",
};

function fixture() {
  const repository = {
    findWorkspace: () => Promise.resolve({ id: "workspace", name: "Studio" }),
    listMembers: () => Promise.resolve([]),
    listAuditEvents: vi.fn(() => Promise.resolve([])),
  };
  const app = Fastify();
  void app.register(
    createWorkspaceReadRoutes({
      authenticate: vi.fn().mockResolvedValue(actor),
      service: createWorkspaceReadService(repository),
    }),
  );
  return { app, repository };
}

describe("workspace read routes", () => {
  it("returns the server-resolved membership with current workspace context", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/current",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "workspace",
      name: "Studio",
      membership: { id: "membership", userId: "user", role: "owner" },
    });
    await app.close();
  });

  it("validates and forwards audit pagination", async () => {
    const { app, repository } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/current/audit?limit=25&offset=50",
    });

    expect(response.statusCode).toBe(200);
    expect(repository.listAuditEvents).toHaveBeenCalledWith(
      "workspace",
      26,
      50,
    );
    await app.close();
  });
});
