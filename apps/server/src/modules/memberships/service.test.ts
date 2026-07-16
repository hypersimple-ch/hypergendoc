import { describe, expect, it } from "vitest";
import { type HumanActor } from "../auth/actors.js";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  type MembershipRecord,
  type MembershipRepository,
} from "./service.js";
import type { AuthorizationError } from "./service.js";

const actor: HumanActor = {
  userId: "owner",
  workspaceId: "workspace-a",
  membershipId: "membership-owner",
  role: "owner",
  requestId: "request-1",
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
    findUserIdByVerifiedEmail: (email) =>
      Promise.resolve(email === "member@example.test" ? "member" : undefined),
    insertMembership: (input) => {
      const row = { id: `m-${input.userId}`, ...input };
      rows.push(row);
      return Promise.resolve(row);
    },
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
    transaction: async (operation) => operation(result),
  };
  return result;
}

describe("membership authorization", () => {
  it("rejects an invitee already in another workspace", async () => {
    const rows: MembershipRecord[] = [
      {
        id: "owner-a",
        workspaceId: "workspace-a",
        userId: "owner",
        role: "owner",
      },
      {
        id: "member-b",
        workspaceId: "workspace-b",
        userId: "member",
        role: "member",
      },
    ];
    await expect(
      inviteMember({ memberships: repository(rows) }, actor, {
        email: "member@example.test",
        role: "member",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("does not disclose or mutate memberships in another workspace", async () => {
    const rows: MembershipRecord[] = [
      {
        id: "owner-a",
        workspaceId: "workspace-a",
        userId: "owner",
        role: "owner",
      },
      {
        id: "member-b",
        workspaceId: "workspace-b",
        userId: "member",
        role: "member",
      },
    ];
    await expect(
      removeMember({ memberships: repository(rows) }, actor, "member"),
    ).rejects.toMatchObject({
      code: "not_found",
    } satisfies Partial<AuthorizationError>);
    expect(rows).toHaveLength(2);
  });

  it("never removes or demotes the final owner", async () => {
    const rows: MembershipRecord[] = [
      {
        id: "owner-a",
        workspaceId: "workspace-a",
        userId: "owner",
        role: "owner",
      },
    ];
    const memberships = repository(rows);
    await expect(
      removeMember({ memberships }, actor, "owner"),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      changeMemberRole({ memberships }, actor, "owner", "member"),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
