import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../../platform/audit.js";
import { registerSafeErrorHandler } from "../../platform/errors.js";
import type { HumanActor } from "../auth/actors.js";
import { createMembershipRoutes } from "./routes.js";
import type { MembershipRecord, MembershipRepository } from "./service.js";

const actor: HumanActor = {
  userId: "owner",
  workspaceId: "workspace",
  membershipId: "owner-membership",
  role: "owner",
  requestId: "request",
};

function repository(rows: MembershipRecord[]): MembershipRepository {
  const result: MembershipRepository = {
    findMembership: (workspaceId, userId) =>
      Promise.resolve(
        rows.find(
          (row) => row.workspaceId === workspaceId && row.userId === userId,
        ),
      ),
    findAnyMembership: (userId) =>
      Promise.resolve(rows.find((row) => row.userId === userId)),
    findUserIdByVerifiedEmail: () => Promise.resolve(undefined),
    insertMembership: () => Promise.reject(new Error("not used")),
    updateRole: (input) => {
      const row = rows.find(
        (item) =>
          item.workspaceId === input.workspaceId &&
          item.userId === input.userId,
      );
      if (row) row.role = input.role;
      return Promise.resolve(row);
    },
    deleteMembership: (workspaceId, userId) => {
      const index = rows.findIndex(
        (row) => row.workspaceId === workspaceId && row.userId === userId,
      );
      if (index < 0) return Promise.resolve(false);
      rows.splice(index, 1);
      return Promise.resolve(true);
    },
    countOwners: (workspaceId) =>
      Promise.resolve(
        rows.filter(
          (row) => row.workspaceId === workspaceId && row.role === "owner",
        ).length,
      ),
    transaction: (operation) => operation(result),
  };
  return result;
}

describe("membership mutation routes", () => {
  it("changes and removes a member while writing safe audit events", async () => {
    const rows: MembershipRecord[] = [
      {
        id: "owner-membership",
        workspaceId: "workspace",
        userId: "owner",
        role: "owner",
      },
      {
        id: "member-membership",
        workspaceId: "workspace",
        userId: "member",
        role: "member",
      },
    ];
    const write = vi.fn<AuditWriter["write"]>().mockResolvedValue(undefined);
    const audit: AuditWriter = { write };
    const app = Fastify();
    registerSafeErrorHandler(app);
    await app.register(
      createMembershipRoutes({
        authenticate: vi.fn().mockResolvedValue(actor),
        memberships: repository(rows),
        audit,
      }),
    );

    const changed = await app.inject({
      method: "PATCH",
      url: "/api/workspaces/current/members/member",
      payload: { role: "owner" },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ userId: "member", role: "owner" });

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/current/members/member",
    });
    expect(removed.statusCode).toBe(204);
    expect(rows.map((row) => row.userId)).toEqual(["owner"]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls.map(([event]) => event.event)).toEqual([
      "membership.role_changed",
      "membership.removed",
    ]);
    await app.close();
  });
});
